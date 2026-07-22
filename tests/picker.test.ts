import { describe, expect, it, vi } from "vitest";
import { createPicker } from "@/picker";
import type { FileData, StorageProvider } from "@/picker/types";

interface FakeOptions {
  multiple?: boolean;
}

interface FakeRawData {
  extra: string;
}

describe("createPicker", () => {
  it("delegates open() to the provider with the given options", async () => {
    const files: FileData<FakeRawData>[] = [
      { id: "1", name: "a.txt", link: "https://x/a", rawData: { extra: "y" } },
    ];

    const open = vi.fn().mockResolvedValue(files);
    const provider: StorageProvider<FakeOptions, FakeRawData> = { open };

    const picker = createPicker({ provider });
    const result = await picker.open({ multiple: true });

    expect(open).toHaveBeenCalledWith({ multiple: true });
    expect(result).toBe(files);
  });

  it("propagates provider rejections", async () => {
    const provider: StorageProvider<FakeOptions, FakeRawData> = {
      open: () => Promise.reject(new Error("boom")),
    };

    const picker = createPicker({ provider });

    await expect(picker.open()).rejects.toThrow("boom");
  });
});
