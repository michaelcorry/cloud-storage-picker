import { PickerError } from "./errors";

/**
 * Throws when called outside a browser (e.g. during server-side rendering or
 * in a web worker), where the provider SDKs cannot run.
 */
export function assertBrowser(feature: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new PickerError(
      "unsupported_environment",
      `${feature} can only be used in a browser environment. ` +
        "Make sure the picker is opened from client-side code.",
    );
  }
}

/**
 * Throws an `invalid_config` error when a required configuration value is
 * missing or blank.
 */
export function requireConfig(
  value: string | undefined | null,
  name: string,
  provider: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PickerError(
      "invalid_config",
      `${provider}: \`${name}\` is required and must be a non-empty string.`,
    );
  }

  return value.trim();
}

const scriptPromises = new Map<string, Promise<void>>();

/**
 * Loads an external script once, deduplicating concurrent and repeated calls
 * for the same URL. A failed load is evicted from the cache so a later call
 * can retry (e.g. after a transient network failure).
 */
export function loadScript(
  src: string,
  configure?: (script: HTMLScriptElement) => void,
): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    configure?.(script);

    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(
        new PickerError(
          "load_failed",
          `Failed to load script: ${src}. ` +
            "Check your network connection and Content Security Policy.",
        ),
      );
    };

    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  promise.catch(() => scriptPromises.delete(src));

  return promise;
}
