import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPickerError, PickerError } from "@/picker/errors";
import { loadScript, requireConfig } from "@/picker/utils";

describe("requireConfig", () => {
  it("returns the trimmed value when present", () => {
    expect(requireConfig("  key  ", "appKey", "provider")).toBe("key");
  });

  it.each(["", "   ", undefined, null])(
    "throws invalid_config for %j",
    (value) => {
      try {
        requireConfig(value as string, "appKey", "myProvider");
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(isPickerError(error)).toBe(true);
        expect((error as PickerError).code).toBe("invalid_config");
        expect((error as PickerError).message).toContain("myProvider");
        expect((error as PickerError).message).toContain("appKey");
      }
    },
  );
});

describe("loadScript", () => {
  // Capture created script elements without connecting them to the document,
  // so happy-dom does not try to fetch the (fake) URLs itself and load/error
  // events can be fired manually.
  let appended: HTMLScriptElement[];

  beforeEach(() => {
    appended = [];
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLScriptElement);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends a single script tag for concurrent loads of the same URL", async () => {
    const src = "https://example.com/dedupe.js";

    const first = loadScript(src);
    const second = loadScript(src);

    expect(first).toBe(second);
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(src);

    appended[0].onload?.(new Event("load"));

    await expect(first).resolves.toBeUndefined();
  });

  it("rejects with load_failed and allows a retry after failure", async () => {
    const src = "https://example.com/flaky.js";

    const first = loadScript(src);
    appended[0].onerror?.(new Event("error"));

    await expect(first).rejects.toMatchObject({
      name: "PickerError",
      code: "load_failed",
    });

    // The failed promise must be evicted so a retry creates a new script tag.
    const retry = loadScript(src);
    expect(retry).not.toBe(first);
    expect(appended).toHaveLength(2);

    appended[1].onload?.(new Event("load"));

    await expect(retry).resolves.toBeUndefined();
  });

  it("applies the configure callback to the script element", async () => {
    const src = "https://example.com/configured.js";

    const promise = loadScript(src, (script) => {
      script.id = "my-script";
      script.dataset.appKey = "abc";
    });

    const script = appended[0];
    expect(script.id).toBe("my-script");
    expect(script.dataset.appKey).toBe("abc");

    script.onload?.(new Event("load"));
    await promise;
  });
});
