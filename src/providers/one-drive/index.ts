import type { FileData, StorageProvider } from "@/picker/types";

export type OneDriveAccountType = "individual" | "organization";

export interface OneDriveConfig {
  /**
   * Microsoft Entra / OneDrive app client ID.
   */
  clientId: string;
  /**
   * Redirect URI configured in the app registration.
   * Defaults to `window.location.origin`.
   */
  redirectUri?: string;
  /**
   * Account type this provider should target.
   * - `individual`: OneDrive consumer accounts using OneDrive JS picker SDK.
   * - `organization`: Microsoft 365 work/school accounts via Microsoft Graph.
   */
  accountType?: OneDriveAccountType;
  /**
   * Tenant used for organization auth. Defaults to `organizations`.
   */
  tenant?: string;
}

export interface OneDriveOptions {
  /**
   * Whether to allow selecting multiple files.
   */
  multiSelect?: boolean;
  /**
   * Maximum number of items the caller wants.
   */
  maxItems?: number;
}

export interface OneDriveFileData {
  /**
   * Drive item id.
   */
  id: string;
  /**
   * Drive item name.
   */
  name: string;
  /**
   * Direct download URL when available.
   */
  downloadUrl?: string;
  /**
   * Microsoft Graph web URL.
   */
  webUrl?: string;
  /**
   * Mime type if provided.
   */
  mimeType?: string;
  /**
   * Size in bytes.
   */
  size?: number;
}

interface OneDriveSdkResponse {
  value?: Array<{
    id: string;
    name: string;
    webUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
    file?: {
      mimeType?: string;
    };
    size?: number;
  }>;
}

interface GraphDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  "@microsoft.graph.downloadUrl"?: string;
  file?: {
    mimeType?: string;
  };
}

export type OneDriveProvider = (
  config: OneDriveConfig,
  options?: OneDriveOptions,
) => StorageProvider<OneDriveOptions, OneDriveFileData>;

declare global {
  interface Window {
    OneDrive?: {
      open: (options: Record<string, unknown>) => void;
    };
  }
}

export const oneDriveProvider: OneDriveProvider = (config, options) => {
  const accountType = config.accountType ?? "individual";

  return {
    open: async (opts = {}) => {
      const finalOptions = { ...options, ...opts };

      if (accountType === "organization") {
        return openOrganizationPicker(config, finalOptions);
      }

      return openIndividualPicker(config, finalOptions);
    },
  };
};

async function openIndividualPicker(
  config: OneDriveConfig,
  options: OneDriveOptions,
): Promise<FileData<OneDriveFileData>[]> {
  await loadScript("https://js.live.net/v7.2/OneDrive.js");

  return new Promise((resolve, reject) => {
    if (!window.OneDrive) {
      return reject(new Error("OneDrive SDK not loaded"));
    }

    window.OneDrive.open({
      clientId: config.clientId,
      action: "query",
      multiSelect: options.multiSelect ?? false,
      success: (response: OneDriveSdkResponse) => {
        const files = (response.value ?? []).map(mapItemToFileData);

        if (options.maxItems) {
          return resolve(files.slice(0, options.maxItems));
        }

        resolve(files);
      },
      cancel: () => reject(new Error("User cancelled OneDrive picker")),
      error: (error: unknown) => {
        reject(new Error(`OneDrive picker error: ${stringifyUnknown(error)}`));
      },
    });
  });
}

async function openOrganizationPicker(
  config: OneDriveConfig,
  options: OneDriveOptions,
): Promise<FileData<OneDriveFileData>[]> {
  const redirectUri = config.redirectUri ?? window.location.origin;
  const tenant = config.tenant ?? "organizations";
  const token = await getGraphToken({
    clientId: config.clientId,
    redirectUri,
    tenant,
  });

  const items = await fetchOrganizationDriveItems(token);
  const pickableItems = items.filter((item) => item.file);

  if (pickableItems.length === 0) {
    throw new Error("No files available in OneDrive");
  }

  if (options.multiSelect) {
    const chosen = pickByPrompt(pickableItems, true, options.maxItems);
    return chosen.map(mapItemToFileData);
  }

  const [chosen] = pickByPrompt(pickableItems, false, options.maxItems);
  if (!chosen) {
    throw new Error("User cancelled OneDrive picker");
  }

  return [mapItemToFileData(chosen)];
}

function pickByPrompt(
  items: GraphDriveItem[],
  multiple: boolean,
  maxItems?: number,
): GraphDriveItem[] {
  const listed = items
    .map((item, index) => `${index + 1}. ${item.name}`)
    .join("\n");

  if (multiple) {
    const raw = window.prompt(
      `Select OneDrive files by entering comma-separated numbers:\n\n${listed}`,
    );

    if (!raw) {
      throw new Error("User cancelled OneDrive picker");
    }

    const indexes = raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < items.length);

    const uniqueIndexes = [...new Set(indexes)];
    const selected = uniqueIndexes.map((index) => items[index]!);

    if (maxItems) {
      return selected.slice(0, maxItems);
    }

    return selected;
  }

  const raw = window.prompt(`Select OneDrive file by number:\n\n${listed}`);

  if (!raw) {
    throw new Error("User cancelled OneDrive picker");
  }

  const index = Number.parseInt(raw.trim(), 10) - 1;

  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new Error("Invalid OneDrive selection");
  }

  return [items[index]!];
}

function mapItemToFileData(item: GraphDriveItem): FileData<OneDriveFileData> {
  const link = item.webUrl ?? item["@microsoft.graph.downloadUrl"] ?? "";

  return {
    id: item.id,
    name: item.name,
    link,
    rawData: {
      id: item.id,
      name: item.name,
      downloadUrl: item["@microsoft.graph.downloadUrl"],
      webUrl: item.webUrl,
      mimeType: item.file?.mimeType,
      size: item.size,
    },
  };
}

async function fetchOrganizationDriveItems(token: string): Promise<GraphDriveItem[]> {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,webUrl,size,file,@microsoft.graph.downloadUrl",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch OneDrive files (${response.status})`);
  }

  const data = (await response.json()) as { value?: GraphDriveItem[] };
  return data.value ?? [];
}

async function getGraphToken(params: {
  clientId: string;
  redirectUri: string;
  tenant: string;
}): Promise<string> {
  const authUrl = new URL(`https://login.microsoftonline.com/${params.tenant}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("scope", "openid profile Files.Read");
  authUrl.searchParams.set("response_mode", "fragment");

  const popup = window.open(authUrl.toString(), "onedrive-auth", "width=600,height=700");

  if (!popup) {
    throw new Error("Failed to open OneDrive auth popup");
  }

  return new Promise<string>((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        reject(new Error("OneDrive auth popup was closed"));
        return;
      }

      try {
        const popupUrl = popup.location.href;

        if (!popupUrl.startsWith(params.redirectUri)) {
          return;
        }

        const hash = popup.location.hash.replace(/^#/, "");
        const parts = new URLSearchParams(hash);
        const token = parts.get("access_token");
        const error = parts.get("error_description") ?? parts.get("error");

        popup.close();
        window.clearInterval(timer);

        if (token) {
          resolve(token);
          return;
        }

        reject(new Error(error ?? "Failed to retrieve OneDrive access token"));
      } catch {
        // Ignore cross-origin errors until redirected back to our origin.
      }
    }, 250);
  });
}

function loadScript(src: string): Promise<void> {
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src=\"${src}\"]`);
  if (existingScript) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function stringifyUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : JSON.stringify(error);
}
