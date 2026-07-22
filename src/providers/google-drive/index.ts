import { PickerError } from "@/picker/errors";
import type { FileData, StorageProvider } from "@/picker/types";
import { assertBrowser, loadScript, requireConfig } from "@/picker/utils";

export interface GoogleDriveConfig {
  /**
   * Required. OAuth 2.0 Client ID for Google Drive API.
   */
  clientId: string;
  /**
   * Required. API Key for Google Drive API.
   */
  apiKey: string;
  /**
   * Optional. The Google Cloud project number. Required when using the
   * `drive.file` scope so picked files are shared with your app.
   */
  appId?: string;
  /**
   * Optional. OAuth scopes to request. Defaults to
   * `["https://www.googleapis.com/auth/drive.readonly"]`.
   */
  scopes?: string[];
}

export interface GoogleDriveOptions {
  /**
   * Optional. Sets the maximum number of items a user can pick.
   */
  maxItems?: number;
  /**
   * Optional. A value of false (default) limits selection to a single file,
   * while true enables multiple file selection.
   */
  multiSelect?: boolean;
  /**
   * Optional. A list of MIME types (e.g. ["application/pdf", "image/png"]).
   * If specified, the user will only be able to select files with these
   * MIME types.
   */
  mimeTypes?: string[];
  /**
   * Optional. A value of false (default) hides folders, while true shows
   * folders in the picker so the user can navigate into them.
   */
  includeFolders?: boolean;
  /**
   * Optional. ISO 639 language code (e.g. "en", "fr", "de") used to localize
   * the picker UI. Defaults to the user's preferred language.
   */
  locale?: string;
}

export interface GoogleDriveFileData {
  /**
   * Unique ID for the file.
   */
  id: string;
  /**
   * The name of the file.
   */
  name: string;
  /**
   * The MIME type of the file.
   */
  mimeType: string;
  /**
   * The URL of the file.
   */
  url: string;
  /**
   * Size of the file in bytes, when available.
   */
  sizeBytes?: number;
  /**
   * A URL to an icon for the file, when available.
   */
  iconUrl?: string;
  /**
   * A user-contributed description of the file, when available.
   */
  description?: string;
  /**
   * Timestamp (ms since epoch) of the last edit, when available.
   */
  lastEditedUtc?: number;
}

export type GoogleDriveProvider = (
  config: GoogleDriveConfig,
  options?: GoogleDriveOptions,
) => StorageProvider<GoogleDriveOptions, GoogleDriveFileData>;

const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/**
 * Milliseconds subtracted from a token's lifetime so a token that is about
 * to expire is refreshed instead of being handed to the picker.
 */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Creates a Google Drive storage provider that opens the Google Picker.
 *
 * Access tokens are cached per provider instance and reused until they are
 * about to expire, so repeated `open()` calls do not re-prompt the user.
 *
 * @param config - Required Google API configuration.
 * @param [options] - Default picker options applied to every `open()` call.
 * @returns A `StorageProvider` that resolves to selected Google Drive files.
 * @throws {PickerError} `invalid_config` when `clientId` or `apiKey` is missing.
 *
 * @example
 * const googleDrive = googleDriveProvider({
 *   clientId: "your-client-id.apps.googleusercontent.com",
 *   apiKey: "your-api-key",
 * });
 *
 * const files = await googleDrive.open({ multiSelect: true });
 */
export const googleDriveProvider: GoogleDriveProvider = (config, options) => {
  const clientId = requireConfig(
    config?.clientId,
    "clientId",
    "googleDriveProvider",
  );
  const apiKey = requireConfig(config?.apiKey, "apiKey", "googleDriveProvider");
  const scopes = config.scopes?.length ? config.scopes : DEFAULT_SCOPES;

  let cachedToken: CachedToken | undefined;

  const getToken = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }

    cachedToken = await requestAccessToken(clientId, scopes);

    return cachedToken.accessToken;
  };

  return {
    open: async (opts = {}) => {
      assertBrowser("The Google Drive picker");

      await loadGoogleApis();

      const token = await getToken();

      const finalOptions = { ...options, ...opts };

      return new Promise<FileData<GoogleDriveFileData>[]>((resolve, reject) => {
        const pickerCallback = (data: google.picker.ResponseObject) => {
          const action = data[google.picker.Response.ACTION];

          if (action === google.picker.Action.PICKED) {
            const files = data[google.picker.Response.DOCUMENTS]?.map((doc) =>
              mapDocument(doc),
            );

            return resolve(files ?? []);
          }

          if (action === google.picker.Action.CANCEL) {
            return reject(
              new PickerError(
                "cancelled",
                "User cancelled Google Drive picker",
              ),
            );
          }

          if (action === google.picker.Action.ERROR) {
            return reject(
              new PickerError(
                "picker_failed",
                "Error occurred in Google Drive picker",
              ),
            );
          }
        };

        const view = new window.google.picker.DocsView(
          window.google.picker.ViewId.DOCS,
        );

        if (finalOptions.mimeTypes?.length) {
          view.setMimeTypes(finalOptions.mimeTypes.join(","));
        }

        if (finalOptions.includeFolders) {
          view.setIncludeFolders(true);
        }

        const picker = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .setCallback(pickerCallback);

        if (config.appId) {
          picker.setAppId(config.appId);
        }

        if (finalOptions.locale) {
          picker.setLocale(finalOptions.locale as google.picker.Locales);
        }

        if (finalOptions.multiSelect) {
          picker.enableFeature(
            window.google.picker.Feature.MULTISELECT_ENABLED,
          );
        }

        if (finalOptions.maxItems) {
          picker.setMaxItems(finalOptions.maxItems);
        }

        picker.build().setVisible(true);
      });
    },
  };
};

function mapDocument(
  doc: google.picker.DocumentObject,
): FileData<GoogleDriveFileData> {
  const rawData: GoogleDriveFileData = {
    id: doc[google.picker.Document.ID],
    name: doc[google.picker.Document.NAME] ?? "",
    mimeType: doc[google.picker.Document.MIME_TYPE] ?? "",
    url: doc[google.picker.Document.URL] ?? "",
    sizeBytes: doc.sizeBytes,
    iconUrl: doc[google.picker.Document.ICON_URL],
    description: doc[google.picker.Document.DESCRIPTION],
    lastEditedUtc: doc[google.picker.Document.LAST_EDITED_UTC],
  };

  return {
    id: rawData.id,
    name: rawData.name,
    link: rawData.url,
    rawData,
  };
}

function requestAccessToken(
  clientId: string,
  scopes: string[],
): Promise<CachedToken> {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(" "),
      callback: (response) => {
        if (response.access_token) {
          const expiresInSeconds = Number(response.expires_in) || 3600;

          resolve({
            accessToken: response.access_token,
            expiresAt:
              Date.now() + expiresInSeconds * 1000 - TOKEN_EXPIRY_BUFFER_MS,
          });
        } else if (response.error === "access_denied") {
          reject(
            new PickerError(
              "cancelled",
              "User declined Google Drive authorization",
            ),
          );
        } else {
          reject(
            new PickerError(
              "auth_failed",
              response.error_description ||
                response.error ||
                "Failed to get Google access token",
            ),
          );
        }
      },
      error_callback: (error) => {
        if (error.type === "popup_closed") {
          reject(
            new PickerError("cancelled", "User closed Google sign-in popup"),
          );
        } else if (error.type === "popup_failed_to_open") {
          reject(
            new PickerError(
              "popup_blocked",
              "Google sign-in popup was blocked. Open the picker from a " +
                "user gesture (e.g. a click handler) and allow popups.",
            ),
          );
        } else {
          reject(
            new PickerError("auth_failed", error.message || "Sign-in failed", {
              cause: error,
            }),
          );
        }
      },
    });

    tokenClient.requestAccessToken();
  });
}

let googleApisPromise: Promise<void> | undefined;

function loadGoogleApis(): Promise<void> {
  // Both the picker and the identity services may already be on the page
  // (loaded by the host app or a previous call).
  if (window.google?.picker && window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  googleApisPromise ??= (async () => {
    await Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client"),
    ]);

    await new Promise<void>((resolve, reject) => {
      window.gapi.load("client:picker", {
        callback: resolve,
        onerror: () =>
          reject(
            new PickerError("load_failed", "Failed to load Google Picker API"),
          ),
      });
    });
  })();

  googleApisPromise.catch(() => (googleApisPromise = undefined));

  return googleApisPromise;
}
