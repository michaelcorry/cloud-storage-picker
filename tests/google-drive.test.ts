import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleDriveProvider } from "@/providers/google-drive";

/**
 * Minimal stand-ins for the Google Picker enums. The provider only ever reads
 * these constants from `window.google.picker`, so the values just need to be
 * consistent between the enums and the fake response objects below.
 */
const Response = { ACTION: "action", DOCUMENTS: "docs" } as const;
const Action = { PICKED: "picked", CANCEL: "cancel", ERROR: "error" } as const;
const Document = {
  ID: "id",
  NAME: "name",
  MIME_TYPE: "mimeType",
  URL: "url",
  ICON_URL: "iconUrl",
  DESCRIPTION: "description",
  LAST_EDITED_UTC: "lastEditedUtc",
} as const;
const Feature = { MULTISELECT_ENABLED: "multiselectEnabled" } as const;
const ViewId = { DOCS: "all" } as const;

type PickerCallback = (data: Record<string, unknown>) => void;

interface GoogleMockState {
  initTokenClient: ReturnType<typeof vi.fn>;
  tokenResponse: Record<string, unknown>;
  pickerResponse: Record<string, unknown>;
  builder: Record<string, ReturnType<typeof vi.fn>>;
  docsView: Record<string, ReturnType<typeof vi.fn>>;
}

function installGoogleMocks(): GoogleMockState {
  const state: GoogleMockState = {
    tokenResponse: { access_token: "test-token", expires_in: "3600" },
    pickerResponse: { [Response.ACTION]: Action.CANCEL },
    initTokenClient: vi.fn(),
    builder: {},
    docsView: {},
  };

  state.initTokenClient.mockImplementation(
    (config: { callback: (response: unknown) => void }) => ({
      requestAccessToken: () => config.callback(state.tokenResponse),
    }),
  );

  class FakeDocsView {
    setMimeTypes = vi.fn().mockReturnThis();
    setIncludeFolders = vi.fn().mockReturnThis();

    constructor() {
      state.docsView = {
        setMimeTypes: this.setMimeTypes,
        setIncludeFolders: this.setIncludeFolders,
      };
    }
  }

  class FakePickerBuilder {
    private callback: PickerCallback | undefined;

    addView = vi.fn().mockReturnThis();
    setOAuthToken = vi.fn().mockReturnThis();
    setDeveloperKey = vi.fn().mockReturnThis();
    setAppId = vi.fn().mockReturnThis();
    setLocale = vi.fn().mockReturnThis();
    enableFeature = vi.fn().mockReturnThis();
    setMaxItems = vi.fn().mockReturnThis();

    setCallback = vi.fn((callback: PickerCallback) => {
      this.callback = callback;
      return this;
    });

    build = vi.fn(() => ({
      setVisible: () => {
        queueMicrotask(() => this.callback?.(state.pickerResponse));
      },
    }));

    constructor() {
      state.builder = {
        addView: this.addView,
        setOAuthToken: this.setOAuthToken,
        setDeveloperKey: this.setDeveloperKey,
        setAppId: this.setAppId,
        setLocale: this.setLocale,
        enableFeature: this.enableFeature,
        setMaxItems: this.setMaxItems,
        setCallback: this.setCallback,
        build: this.build,
      };
    }
  }

  const globalWindow = window as unknown as Record<string, unknown>;

  globalWindow.gapi = {
    load: (_name: string, config: { callback: () => void }) =>
      config.callback(),
  };

  globalWindow.google = {
    accounts: {
      oauth2: { initTokenClient: state.initTokenClient },
    },
    picker: {
      Response,
      Action,
      Document,
      Feature,
      ViewId,
      DocsView: FakeDocsView,
      PickerBuilder: FakePickerBuilder,
    },
  };

  return state;
}

const config = { clientId: "client-id", apiKey: "api-key" };

let mocks: GoogleMockState;

beforeEach(() => {
  mocks = installGoogleMocks();
});

describe("googleDriveProvider", () => {
  it("throws invalid_config when clientId or apiKey is missing", () => {
    expect(() =>
      googleDriveProvider({ clientId: "", apiKey: "x" }),
    ).toThrowError(expect.objectContaining({ code: "invalid_config" }));

    expect(() =>
      googleDriveProvider({ clientId: "x", apiKey: " " }),
    ).toThrowError(expect.objectContaining({ code: "invalid_config" }));
  });

  it("resolves with normalized file data when the user picks files", async () => {
    mocks.pickerResponse = {
      [Response.ACTION]: Action.PICKED,
      [Response.DOCUMENTS]: [
        {
          [Document.ID]: "file-1",
          [Document.NAME]: "notes.txt",
          [Document.MIME_TYPE]: "text/plain",
          [Document.URL]: "https://drive.google.com/file/d/file-1",
          sizeBytes: 42,
        },
      ],
    };

    const provider = googleDriveProvider(config);
    const files = await provider.open();

    expect(files).toEqual([
      {
        id: "file-1",
        name: "notes.txt",
        link: "https://drive.google.com/file/d/file-1",
        rawData: expect.objectContaining({
          id: "file-1",
          mimeType: "text/plain",
          sizeBytes: 42,
        }),
      },
    ]);
  });

  it("rejects with a cancelled PickerError when the user closes the picker", async () => {
    mocks.pickerResponse = { [Response.ACTION]: Action.CANCEL };

    const provider = googleDriveProvider(config);

    await expect(provider.open()).rejects.toMatchObject({
      name: "PickerError",
      code: "cancelled",
    });
  });

  it("reuses a cached access token across open() calls", async () => {
    mocks.pickerResponse = {
      [Response.ACTION]: Action.PICKED,
      [Response.DOCUMENTS]: [],
    };

    const provider = googleDriveProvider(config);

    await provider.open();
    await provider.open();

    expect(mocks.initTokenClient).toHaveBeenCalledTimes(1);
  });

  it("rejects with cancelled when the user declines authorization", async () => {
    mocks.tokenResponse = { error: "access_denied" };

    const provider = googleDriveProvider(config);

    await expect(provider.open()).rejects.toMatchObject({
      code: "cancelled",
    });
  });

  it("applies multiSelect, mimeTypes and maxItems options", async () => {
    mocks.pickerResponse = {
      [Response.ACTION]: Action.PICKED,
      [Response.DOCUMENTS]: [],
    };

    const provider = googleDriveProvider(config, {
      mimeTypes: ["application/pdf", "image/png"],
    });

    await provider.open({ multiSelect: true, maxItems: 3 });

    expect(mocks.docsView.setMimeTypes).toHaveBeenCalledWith(
      "application/pdf,image/png",
    );
    expect(mocks.builder.enableFeature).toHaveBeenCalledWith(
      Feature.MULTISELECT_ENABLED,
    );
    expect(mocks.builder.setMaxItems).toHaveBeenCalledWith(3);
  });
});
