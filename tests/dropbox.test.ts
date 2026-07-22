import { afterEach, describe, expect, it, vi } from "vitest";
import { dropboxProvider, type DropboxFileData } from "@/providers/dropbox";

const sampleFile: DropboxFileData = {
  id: "id:abc123",
  name: "report.pdf",
  bytes: 1024,
  isDir: false,
  link: "https://www.dropbox.com/s/abc123/report.pdf",
  linkType: "preview",
  icon: "https://www.dropbox.com/static/icons/pdf.png",
};

type ChooseOptions = Parameters<Dropbox.Chooser["choose"]>[0];

function mockDropbox(
  impl: (options: ChooseOptions) => void,
): ReturnType<typeof vi.fn> {
  const choose = vi.fn(impl);
  (window as { Dropbox?: unknown }).Dropbox = { choose };
  return choose;
}

afterEach(() => {
  delete (window as { Dropbox?: unknown }).Dropbox;
});

describe("dropboxProvider", () => {
  it("throws invalid_config when appKey is missing", () => {
    expect(() => dropboxProvider({ appKey: "" })).toThrowError(
      expect.objectContaining({ code: "invalid_config" }),
    );
  });

  it("resolves with normalized file data on success", async () => {
    mockDropbox((options) => options.success([sampleFile]));

    const provider = dropboxProvider({ appKey: "key" });
    const files = await provider.open();

    expect(files).toEqual([
      {
        id: sampleFile.id,
        name: sampleFile.name,
        link: sampleFile.link,
        rawData: sampleFile,
      },
    ]);
  });

  it("rejects with a cancelled PickerError when the user closes the chooser", async () => {
    mockDropbox((options) => options.cancel?.());

    const provider = dropboxProvider({ appKey: "key" });

    await expect(provider.open()).rejects.toMatchObject({
      name: "PickerError",
      code: "cancelled",
    });
  });

  it("merges default options with per-call overrides", async () => {
    const choose = mockDropbox((options) => options.success([]));

    const provider = dropboxProvider(
      { appKey: "key" },
      { multiSelect: false, extensions: [".pdf"] },
    );

    await provider.open({ multiSelect: true, sizeLimit: 100 });

    expect(choose).toHaveBeenCalledWith(
      expect.objectContaining({
        multiselect: true,
        extensions: [".pdf"],
        sizeLimit: 100,
      }),
    );
  });

  it("rejects direct links combined with folder selection", async () => {
    mockDropbox(() => {});

    const provider = dropboxProvider(
      { appKey: "key" },
      { linkType: "direct" },
    );

    await expect(provider.open({ folderSelect: true })).rejects.toMatchObject({
      name: "PickerError",
      code: "invalid_config",
    });
  });
});
