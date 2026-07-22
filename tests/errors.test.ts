import { describe, expect, it } from "vitest";
import {
  isCancelledError,
  isPickerError,
  PickerError,
} from "@/picker/errors";

describe("PickerError", () => {
  it("exposes a machine-readable code and message", () => {
    const error = new PickerError("cancelled", "User cancelled");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PickerError");
    expect(error.code).toBe("cancelled");
    expect(error.message).toBe("User cancelled");
  });

  it("preserves the underlying cause", () => {
    const cause = new Error("network down");
    const error = new PickerError("load_failed", "Script failed", { cause });

    expect(error.cause).toBe(cause);
  });
});

describe("isPickerError", () => {
  it("returns true for PickerError instances", () => {
    expect(isPickerError(new PickerError("auth_failed", "nope"))).toBe(true);
  });

  it("returns false for other values", () => {
    expect(isPickerError(new Error("plain"))).toBe(false);
    expect(isPickerError("cancelled")).toBe(false);
    expect(isPickerError(null)).toBe(false);
    expect(isPickerError(undefined)).toBe(false);
  });
});

describe("isCancelledError", () => {
  it("returns true only for cancelled PickerErrors", () => {
    expect(isCancelledError(new PickerError("cancelled", "closed"))).toBe(
      true,
    );
    expect(isCancelledError(new PickerError("auth_failed", "nope"))).toBe(
      false,
    );
    expect(isCancelledError(new Error("User cancelled"))).toBe(false);
  });
});
