/**
 * Machine-readable reason a picker operation failed.
 *
 * - `cancelled` - The user dismissed the picker or declined to sign in.
 * - `popup_blocked` - The browser prevented a required popup from opening.
 * - `load_failed` - A provider SDK script failed to load (network, CSP, etc.).
 * - `auth_failed` - Authentication or token acquisition failed.
 * - `picker_failed` - The provider's picker UI reported an error.
 * - `invalid_config` - The provider was created or opened with invalid
 *   configuration or options.
 * - `unsupported_environment` - The picker was used outside a browser
 *   (e.g. during server-side rendering).
 */
export type PickerErrorCode =
  | "cancelled"
  | "popup_blocked"
  | "load_failed"
  | "auth_failed"
  | "picker_failed"
  | "invalid_config"
  | "unsupported_environment";

/**
 * Error thrown by all providers. Inspect the `code` property (or use the
 * `isCancelledError` helper) instead of matching on error messages.
 *
 * @example
 * try {
 *   const files = await picker.open();
 * } catch (error) {
 *   if (isCancelledError(error)) return; // user changed their mind
 *   throw error;
 * }
 */
export class PickerError extends Error {
  /**
   * Machine-readable reason for the failure.
   */
  readonly code: PickerErrorCode;

  /**
   * The underlying error that caused this one, when available.
   */
  readonly cause?: unknown;

  constructor(
    code: PickerErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "PickerError";
    this.code = code;
    this.cause = options?.cause;
  }
}

/**
 * Returns true if the given value is a `PickerError`.
 */
export function isPickerError(error: unknown): error is PickerError {
  return error instanceof PickerError;
}

/**
 * Returns true if the given error means the user dismissed the picker or
 * declined to sign in. Treat this as a no-op rather than a failure.
 */
export function isCancelledError(error: unknown): boolean {
  return isPickerError(error) && error.code === "cancelled";
}
