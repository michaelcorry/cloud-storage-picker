import { PickerError } from "@/picker/errors";
import type { FileData, StorageProvider } from "@/picker/types";
import { assertBrowser, loadScript, requireConfig } from "@/picker/utils";

export interface DropboxConfig {
  /**
   * Required. The Dropbox App Key for your application.
   */
  appKey: string;
}

export interface DropboxOptions {
  /**
   * Optional. "preview" (default) is a preview link to the document for
   * sharing, "direct" is an expiring link to download the contents of the file.
   *
   * See: https://www.dropbox.com/developers/chooser#link-types
   */
  linkType?: "preview" | "direct";
  /**
   * Optional. A value of false (default) limits selection to a single file,
   * while true enables multiple file selection.
   */
  multiSelect?: boolean;
  /**
   * Optional. This is a list of file extensions. If specified, the user will
   * only be able to select files with these extensions. You may also specify
   * file types, such as "video" or "images" in the list.
   *
   * By default, all extensions are allowed.
   *
   * See: https://www.dropbox.com/developers/chooser#file-types
   */
  extensions?: string[];
  /**
   * Optional. A value of false (default) limits selection to files, while true
   * allows the user to select both folders and files.
   *
   * You cannot specify `linkType: "direct"` when using `folderSelect: true`.
   */
  folderSelect?: boolean;
  /**
   * Optional. A limit on the size of each file that may be selected, in bytes.
   * If specified, the user will only be able to select files with size less
   * than or equal to this limit.
   *
   * For the purposes of this option, folders have size zero.
   */
  sizeLimit?: number;
}

export interface DropboxFileData {
  /**
   * Unique ID for the file.
   */
  id: string;
  /**
   * Name of the file.
   */
  name: string;
  /**
   * Size of the file in bytes. Folders have size zero.
   */
  bytes: number;
  /**
   * Boolean, whether or not the file is actually a directory.
   */
  isDir: boolean;
  /**
   * URL to access the file, which varies depending on the linkType specified
   * when the chooser was triggered.
   */
  link: string;
  /**
   * Type of link returned: "preview" or "direct".
   */
  linkType: "preview" | "direct";
  /**
   * URL to a 64x64px icon for the file based on the file's extension.
   */
  icon: string;
  /**
   * A thumbnail URL generated when the user selects images and videos.
   * If the user didn't select an image or video, no thumbnail will be included.
   *
   * See: https://www.dropbox.com/developers/chooser#response
   */
  thumbnailLink?: string;
}

export type DropboxProvider = (
  config: DropboxConfig,
  options?: DropboxOptions,
) => StorageProvider<DropboxOptions, DropboxFileData>;

const DROPBOX_SCRIPT_URL = "https://www.dropbox.com/static/api/2/dropins.js";

/**
 * Creates a Dropbox storage provider that opens the Dropbox Chooser.
 *
 * @param config - Required Dropbox app configuration.
 * @param [options] - Default chooser options applied to every `open()` call.
 * @returns A `StorageProvider` that resolves to selected Dropbox files.
 * @throws {PickerError} `invalid_config` when `appKey` is missing.
 *
 * @example
 * const dropbox = dropboxProvider({ appKey: "your-app-key" });
 *
 * const files = await dropbox.open({ multiSelect: true });
 */
export const dropboxProvider: DropboxProvider = (config, options) => {
  const appKey = requireConfig(config?.appKey, "appKey", "dropboxProvider");

  return {
    open: async (opts = {}) => {
      assertBrowser("The Dropbox chooser");

      const finalOptions = { ...options, ...opts };

      if (finalOptions.folderSelect && finalOptions.linkType === "direct") {
        throw new PickerError(
          "invalid_config",
          'dropboxProvider: `linkType: "direct"` cannot be combined with ' +
            "`folderSelect: true`. Dropbox does not provide direct links for folders.",
        );
      }

      await loadDropboxScript(appKey);

      return new Promise<FileData<DropboxFileData>[]>((resolve, reject) => {
        const dropbox = window.Dropbox as
          | (Dropbox.Chooser & { isBrowserSupported?: () => boolean })
          | undefined;

        if (!dropbox) {
          return reject(
            new PickerError("load_failed", "Dropbox SDK not loaded"),
          );
        }

        if (dropbox.isBrowserSupported && !dropbox.isBrowserSupported()) {
          return reject(
            new PickerError(
              "unsupported_environment",
              "The Dropbox chooser does not support this browser.",
            ),
          );
        }

        dropbox.choose({
          linkType: finalOptions.linkType,
          multiselect: finalOptions.multiSelect,
          extensions: finalOptions.extensions,
          folderselect: finalOptions.folderSelect,
          sizeLimit: finalOptions.sizeLimit,
          success: (files: DropboxFileData[]) => {
            const mappedFiles: FileData<DropboxFileData>[] = files.map(
              (file) => ({
                id: file.id,
                name: file.name,
                link: file.link,
                rawData: file,
              }),
            );

            resolve(mappedFiles);
          },
          cancel: () =>
            reject(
              new PickerError("cancelled", "User cancelled Dropbox chooser"),
            ),
        });
      });
    },
  };
};

function loadDropboxScript(appKey: string): Promise<void> {
  if (window.Dropbox) return Promise.resolve();

  return loadScript(DROPBOX_SCRIPT_URL, (script) => {
    script.id = "dropboxjs";
    script.dataset.appKey = appKey;
  });
}
