import type { FileData, StorageProvider } from "./types";

export {
  isCancelledError,
  isPickerError,
  PickerError,
  type PickerErrorCode,
} from "./errors";
export type { FileData, StorageProvider } from "./types";

interface PickerParams<Options, RawFileData> {
  provider: StorageProvider<Options, RawFileData>;
}

/**
 * Creates a file chooser for a given storage provider.
 *
 * @param params - Object containing the storage provider implementation.
 * @returns An object with an `open` method that delegates to the provider.
 *
 * @example
 * const picker = createPicker({
 *    provider: dropboxProvider({ appKey: "your-app-key" })
 * });
 *
 * const files = await picker.open({ multiple: true });
 */
export function createPicker<O, R>(params: PickerParams<O, R>) {
  return {
    open: async (options?: O): Promise<FileData<R>[]> => {
      return params.provider.open(options);
    },
  };
}
