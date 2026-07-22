import { PickerError } from "@/picker/errors";
import type { StorageProvider } from "@/picker/types";
import { assertBrowser, requireConfig } from "@/picker/utils";
import {
  createTokenProvider,
  launchPicker,
  type MicrosoftFileData,
  type MicrosoftPickerOptions,
  type MicrosoftTokenProvider,
} from "../microsoft";

export interface SharePointConfig {
  /**
   * Required. The Application (client) ID of your Azure App Registration.
   * The registration must have a SPA redirect URI configured and delegated
   * SharePoint permissions (e.g. AllSites.Read) granted.
   */
  clientId: string;
  /**
   * Required. The URL of the SharePoint site to pick files from, e.g.
   * "https://contoso.sharepoint.com" or
   * "https://contoso.sharepoint.com/sites/marketing".
   *
   * To pick from a user's OneDrive for Business, use the MySite host, e.g.
   * "https://contoso-my.sharepoint.com".
   */
  baseUrl: string;
  /**
   * Optional. The directory (tenant) ID to authenticate against. Defaults to
   * "organizations", which allows any work or school account.
   */
  tenantId?: string;
  /**
   * Optional. The redirect URI registered for the SPA platform of your app
   * registration. Defaults to the current origin.
   */
  redirectUri?: string;
}

export interface SharePointOptions extends MicrosoftPickerOptions {}

export interface SharePointFileData extends MicrosoftFileData {}

export type SharePointProvider = (
  config: SharePointConfig,
  options?: SharePointOptions,
) => StorageProvider<SharePointOptions, SharePointFileData>;

/**
 * Creates a SharePoint storage provider that opens the Microsoft File Picker
 * for SharePoint document libraries and OneDrive for Business (work or
 * school accounts). For personal OneDrive accounts, use the OneDrive
 * provider instead.
 *
 * @param config - Required Azure app and SharePoint site configuration.
 * @param [options] - Default picker options applied to every `open()` call.
 * @returns A `StorageProvider` that resolves to selected SharePoint files.
 * @throws {PickerError} `invalid_config` when `clientId` or `baseUrl` is
 * missing, or when `baseUrl` is not a valid absolute URL.
 *
 * @example
 * const sharepoint = sharePointProvider({
 *   clientId: "your-client-id",
 *   baseUrl: "https://contoso.sharepoint.com",
 * });
 *
 * const files = await sharepoint.open({ multiSelect: true });
 */
export const sharePointProvider: SharePointProvider = (config, options) => {
  const clientId = requireConfig(
    config?.clientId,
    "clientId",
    "sharePointProvider",
  );

  const baseUrl = requireConfig(
    config?.baseUrl,
    "baseUrl",
    "sharePointProvider",
  ).replace(/\/+$/, "");

  let sharePointOrigin: string;
  try {
    sharePointOrigin = new URL(baseUrl).origin;
  } catch (error) {
    throw new PickerError(
      "invalid_config",
      `sharePointProvider: \`baseUrl\` must be a valid absolute URL such as ` +
        `"https://contoso.sharepoint.com", received "${config.baseUrl}".`,
      { cause: error },
    );
  }

  let tokenProviderPromise: Promise<MicrosoftTokenProvider> | undefined;

  return {
    open: async (opts = {}) => {
      assertBrowser("The SharePoint picker");

      if (!tokenProviderPromise) {
        tokenProviderPromise = createTokenProvider({
          clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId ?? "organizations"}`,
          redirectUri: config.redirectUri,
          scopesForResource: (resource) => [
            `${resource ?? sharePointOrigin}/.default`,
          ],
        });

        // A failed setup (e.g. MSAL script blocked) should not poison every
        // subsequent open() call, so drop the cached promise on failure.
        tokenProviderPromise.catch(() => (tokenProviderPromise = undefined));
      }

      const getToken = await tokenProviderPromise;

      const finalOptions = { ...options, ...opts };

      return launchPicker({
        pickerUrl: `${baseUrl}/_layouts/15/FilePicker.aspx`,
        entry: { sharePoint: {} },
        options: finalOptions,
        getToken,
      });
    },
  };
};
