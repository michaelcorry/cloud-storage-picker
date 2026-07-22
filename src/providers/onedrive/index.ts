import type { StorageProvider } from "@/picker/types";
import { assertBrowser, requireConfig } from "@/picker/utils";
import {
  createTokenProvider,
  launchPicker,
  type MicrosoftFileData,
  type MicrosoftPickerOptions,
  type MicrosoftTokenProvider,
} from "../microsoft";

export interface OneDriveConfig {
  /**
   * Required. The Application (client) ID of your Azure App Registration.
   * The registration must allow personal Microsoft accounts and have a SPA
   * redirect URI configured.
   */
  clientId: string;
  /**
   * Optional. The redirect URI registered for the SPA platform of your app
   * registration. Defaults to the current origin.
   */
  redirectUri?: string;
}

export interface OneDriveOptions extends MicrosoftPickerOptions {}

export interface OneDriveFileData extends MicrosoftFileData {}

const ONEDRIVE_PICKER_URL = "https://onedrive.live.com/picker";

const CONSUMER_AUTHORITY = "https://login.microsoftonline.com/consumers";

export type OneDriveProvider = (
  config: OneDriveConfig,
  options?: OneDriveOptions,
) => StorageProvider<OneDriveOptions, OneDriveFileData>;

/**
 * Creates a OneDrive storage provider that opens the Microsoft File Picker
 * for personal (consumer) OneDrive accounts. For OneDrive for Business or
 * SharePoint document libraries, use the SharePoint provider instead.
 *
 * @param config - Required Azure app configuration.
 * @param [options] - Default picker options applied to every `open()` call.
 * @returns A `StorageProvider` that resolves to selected OneDrive files.
 * @throws {PickerError} `invalid_config` when `clientId` is missing.
 *
 * @example
 * const onedrive = oneDriveProvider({ clientId: "your-client-id" });
 *
 * const files = await onedrive.open({ multiSelect: true });
 */
export const oneDriveProvider: OneDriveProvider = (config, options) => {
  const clientId = requireConfig(
    config?.clientId,
    "clientId",
    "oneDriveProvider",
  );

  let tokenProviderPromise: Promise<MicrosoftTokenProvider> | undefined;

  return {
    open: async (opts = {}) => {
      assertBrowser("The OneDrive picker");

      if (!tokenProviderPromise) {
        tokenProviderPromise = createTokenProvider({
          clientId,
          authority: CONSUMER_AUTHORITY,
          redirectUri: config.redirectUri,
          scopesForResource: () => ["OneDrive.ReadWrite"],
        });

        // A failed setup (e.g. MSAL script blocked) should not poison every
        // subsequent open() call, so drop the cached promise on failure.
        tokenProviderPromise.catch(() => (tokenProviderPromise = undefined));
      }

      const getToken = await tokenProviderPromise;

      const finalOptions = { ...options, ...opts };

      return launchPicker({
        pickerUrl: ONEDRIVE_PICKER_URL,
        entry: { oneDrive: { files: {} } },
        options: finalOptions,
        getToken,
      });
    },
  };
};
