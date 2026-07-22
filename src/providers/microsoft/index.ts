import { PickerError } from "@/picker/errors";
import type { FileData } from "@/picker/types";
import { loadScript } from "@/picker/utils";

/**
 * Options shared by the Microsoft File Picker v8 based providers
 * (OneDrive and SharePoint).
 */
export interface MicrosoftPickerOptions {
  /**
   * Optional. A value of false (default) limits selection to a single file,
   * while true enables multiple file selection.
   */
  multiSelect?: boolean;
  /**
   * Optional. This is a list of file extensions (e.g. [".docx", ".png"]).
   * If specified, the user will only be able to select files with these
   * extensions. Use ["folder"] to allow folders alongside extensions.
   *
   * By default, all extensions are allowed.
   */
  extensions?: string[];
  /**
   * Optional. A value of false (default) limits selection to files, while
   * true allows the user to select both folders and files.
   */
  folderSelect?: boolean;
}

/**
 * The raw item returned by the Microsoft File Picker. Items are shaped like
 * Microsoft Graph driveItem resources.
 *
 * See: https://learn.microsoft.com/en-us/graph/api/resources/driveitem
 */
export interface MicrosoftFileData {
  /**
   * Unique ID for the item within its drive.
   */
  id: string;
  /**
   * Name of the item (file name including extension, or folder name).
   */
  name: string;
  /**
   * Size of the item in bytes.
   */
  size?: number;
  /**
   * URL that displays the item in the browser.
   */
  webUrl?: string;
  /**
   * WebDAV compatible URL for the item.
   */
  webDavUrl?: string;
  /**
   * File metadata, present if the item is a file.
   */
  file?: {
    mimeType?: string;
    hashes?: Record<string, string>;
  };
  /**
   * Folder metadata, present if the item is a folder.
   */
  folder?: {
    childCount?: number;
  };
  /**
   * Information about the parent of the item, including the drive ID needed
   * for follow-up Microsoft Graph calls.
   */
  parentReference?: {
    driveId?: string;
    id?: string;
    path?: string;
    siteId?: string;
  };
  /**
   * Additional provider-specific fields (e.g. "@sharePoint.endpoint").
   */
  [key: string]: unknown;
}

interface MsalAccount {
  homeAccountId: string;
  username: string;
}

interface MsalAuthResult {
  accessToken: string;
  account: MsalAccount;
}

interface MsalPublicClientApplication {
  initialize(): Promise<void>;
  getActiveAccount(): MsalAccount | null;
  setActiveAccount(account: MsalAccount | null): void;
  getAllAccounts(): MsalAccount[];
  loginPopup(request: { scopes: string[] }): Promise<MsalAuthResult>;
  acquireTokenSilent(request: {
    scopes: string[];
    account: MsalAccount;
  }): Promise<MsalAuthResult>;
  acquireTokenPopup(request: { scopes: string[] }): Promise<MsalAuthResult>;
}

declare global {
  interface Window {
    msal?: {
      PublicClientApplication: new (config: {
        auth: {
          clientId: string;
          authority: string;
          redirectUri: string;
        };
      }) => MsalPublicClientApplication;
    };
  }
}

export interface MicrosoftAuthParams {
  /**
   * Azure App Registration (client) ID.
   */
  clientId: string;
  /**
   * Full authority URL, e.g. "https://login.microsoftonline.com/consumers".
   */
  authority: string;
  /**
   * Redirect URI registered for the SPA platform of the app registration.
   * Defaults to the current origin.
   */
  redirectUri?: string;
  /**
   * Maps the resource requested by the picker to the OAuth scopes to acquire.
   */
  scopesForResource: (resource?: string) => string[];
}

export type MicrosoftTokenProvider = (resource?: string) => Promise<string>;

const MSAL_SCRIPT_URL =
  "https://alcdn.msauth.net/browser/3.28.1/js/msal-browser.min.js";

/**
 * MSAL error codes that mean the user dismissed a sign-in popup.
 */
const MSAL_CANCELLED_CODES = new Set(["user_cancelled", "user_canceled"]);

/**
 * MSAL error codes that mean a sign-in popup could not be opened.
 */
const MSAL_POPUP_BLOCKED_CODES = new Set([
  "popup_window_error",
  "empty_window_error",
]);

/**
 * Converts an MSAL failure into a `PickerError` with a meaningful code.
 */
function toAuthError(error: unknown): PickerError {
  if (error instanceof PickerError) return error;

  const errorCode =
    typeof error === "object" && error !== null && "errorCode" in error
      ? String((error as { errorCode: unknown }).errorCode)
      : undefined;

  if (errorCode && MSAL_CANCELLED_CODES.has(errorCode)) {
    return new PickerError("cancelled", "User cancelled Microsoft sign-in", {
      cause: error,
    });
  }

  if (errorCode && MSAL_POPUP_BLOCKED_CODES.has(errorCode)) {
    return new PickerError(
      "popup_blocked",
      "Microsoft sign-in popup was blocked. Open the picker from a user " +
        "gesture (e.g. a click handler) and allow popups.",
      { cause: error },
    );
  }

  const message =
    error instanceof Error ? error.message : "Microsoft sign-in failed";

  return new PickerError("auth_failed", message, { cause: error });
}

/**
 * Loads MSAL (on demand) and returns a function that acquires access tokens
 * for a given resource, prompting the user to sign in when required.
 */
export async function createTokenProvider(
  params: MicrosoftAuthParams,
): Promise<MicrosoftTokenProvider> {
  await loadMsalScript();

  if (!window.msal) {
    throw new PickerError("load_failed", "MSAL library not loaded");
  }

  const client = new window.msal.PublicClientApplication({
    auth: {
      clientId: params.clientId,
      authority: params.authority,
      redirectUri: params.redirectUri ?? window.location.origin,
    },
  });

  await client.initialize();

  return async (resource) => {
    const scopes = params.scopesForResource(resource);

    try {
      let account = client.getActiveAccount() ?? client.getAllAccounts()[0];

      if (!account) {
        const result = await client.loginPopup({ scopes });
        account = result.account;
        client.setActiveAccount(account);
      }

      try {
        const result = await client.acquireTokenSilent({ scopes, account });
        return result.accessToken;
      } catch {
        const result = await client.acquireTokenPopup({ scopes });
        return result.accessToken;
      }
    } catch (error) {
      throw toAuthError(error);
    }
  };
}

export interface LaunchPickerParams {
  /**
   * Full URL to the picker page, without a query string. For consumer
   * OneDrive this is "https://onedrive.live.com/picker", for SharePoint it
   * is "{siteUrl}/_layouts/15/FilePicker.aspx".
   */
  pickerUrl: string;
  /**
   * The `entry` section of the picker configuration, controlling where the
   * picker starts browsing.
   */
  entry: Record<string, unknown>;
  /**
   * Picker behavior options.
   */
  options: MicrosoftPickerOptions;
  /**
   * Acquires an access token for the given resource.
   */
  getToken: MicrosoftTokenProvider;
}

/**
 * Opens the Microsoft File Picker v8 in a popup window and resolves with the
 * items the user picked.
 *
 * See: https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers
 */
export async function launchPicker(
  params: LaunchPickerParams,
): Promise<FileData<MicrosoftFileData>[]> {
  const win = window.open("", "MicrosoftFilePicker", "width=1080,height=680");

  if (!win) {
    throw new PickerError(
      "popup_blocked",
      "Failed to open picker window. Open the picker from a user gesture " +
        "(e.g. a click handler) and allow popups for this site.",
    );
  }

  let token: string;
  try {
    token = await params.getToken();
  } catch (error) {
    win.close();
    throw error;
  }

  const channelId = createChannelId();

  const pickerConfig = {
    sdk: "8.0",
    entry: params.entry,
    authentication: {},
    messaging: {
      origin: window.location.origin,
      channelId,
    },
    typesAndSources: {
      mode: params.options.folderSelect ? "all" : "files",
      ...(params.options.extensions?.length
        ? { filters: params.options.extensions }
        : {}),
      pivots: {
        oneDrive: true,
        recent: true,
      },
    },
    selection: {
      mode: params.options.multiSelect ? "multiple" : "single",
    },
  };

  const queryString = new URLSearchParams({
    filePicker: JSON.stringify(pickerConfig),
  });

  const form = win.document.createElement("form");
  form.setAttribute("action", `${params.pickerUrl}?${queryString.toString()}`);
  form.setAttribute("method", "POST");

  const input = win.document.createElement("input");
  input.setAttribute("type", "hidden");
  input.setAttribute("name", "access_token");
  input.setAttribute("value", token);

  form.appendChild(input);
  win.document.body.appendChild(form);
  form.submit();

  return new Promise<FileData<MicrosoftFileData>[]>((resolve, reject) => {
    let port: MessagePort | undefined;
    let settled = false;

    const closeWatcher = window.setInterval(() => {
      if (win.closed) {
        settle(() =>
          reject(
            new PickerError(
              "cancelled",
              "User cancelled Microsoft file picker",
            ),
          ),
        );
      }
    }, 500);

    const cleanup = () => {
      window.clearInterval(closeWatcher);
      window.removeEventListener("message", initListener);
      port?.close();
      if (!win.closed) win.close();
    };

    /**
     * Runs cleanup and settles the promise exactly once; later picker
     * messages and the close watcher become no-ops.
     */
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      finish();
    };

    const commandListener = async (message: MessageEvent) => {
      const payload = message.data;

      if (
        !payload ||
        typeof payload !== "object" ||
        payload.type !== "command" ||
        !payload.data ||
        !port
      ) {
        return;
      }

      port.postMessage({ type: "acknowledge", id: payload.id });

      const command = payload.data;

      switch (command.command) {
        case "authenticate": {
          try {
            const authToken = await params.getToken(command.resource);

            port.postMessage({
              type: "result",
              id: payload.id,
              data: { result: "token", token: authToken },
            });
          } catch (error) {
            port.postMessage({
              type: "result",
              id: payload.id,
              data: {
                result: "error",
                error: {
                  code: "tokenError",
                  message: error instanceof Error ? error.message : `${error}`,
                },
                isExpected: true,
              },
            });
          }
          break;
        }
        case "close": {
          settle(() =>
            reject(
              new PickerError(
                "cancelled",
                "User cancelled Microsoft file picker",
              ),
            ),
          );
          break;
        }
        case "pick": {
          const items: MicrosoftFileData[] = command.items ?? [];

          port.postMessage({
            type: "result",
            id: payload.id,
            data: { result: "success" },
          });

          settle(() =>
            resolve(
              items.map((item) => ({
                id: item.id,
                name: item.name,
                link: item.webUrl ?? item.webDavUrl ?? "",
                rawData: item,
              })),
            ),
          );
          break;
        }
        default: {
          port.postMessage({
            type: "result",
            id: payload.id,
            data: {
              result: "error",
              error: {
                code: "unsupportedCommand",
                message: command.command,
              },
              isExpected: true,
            },
          });
        }
      }
    };

    const initListener = (event: MessageEvent) => {
      if (event.source !== win) return;

      const message = event.data;

      if (message?.type === "initialize" && message.channelId === channelId) {
        port = event.ports[0];
        port.onmessage = commandListener;
        port.postMessage({ type: "activate" });
      }
    };

    window.addEventListener("message", initListener);
  });
}

function createChannelId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `picker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadMsalScript(): Promise<void> {
  if (window.msal) return Promise.resolve();

  return loadScript(MSAL_SCRIPT_URL);
}
