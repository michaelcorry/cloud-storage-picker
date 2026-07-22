# Cloud Storage Picker

[![npm version](https://img.shields.io/npm/v/cloud-storage-picker.svg)](https://www.npmjs.com/package/cloud-storage-picker)
[![license](https://img.shields.io/npm/l/cloud-storage-picker.svg)](https://github.com/melvinotieno/cloud-storage-picker/blob/main/LICENSE)

A lightweight, TypeScript-first library for integrating file pickers from popular cloud storage providers like Dropbox, Google Drive, OneDrive, and SharePoint into your web applications.

## Features

- 🎯 **Type-safe** - Built with TypeScript for full type safety and IntelliSense support
- 🔌 **Pluggable** - Easy-to-use provider architecture for different cloud storage services
- 🪶 **Lightweight** - Minimal bundle size with on-demand script loading
- 🎨 **Framework agnostic** - Works with React, Vue, Svelte, or vanilla JavaScript
- 📦 **Tree-shakeable** - Import only the providers you need
- 🚨 **Predictable errors** - Every failure is a `PickerError` with a machine-readable `code`
- 🔁 **Resilient** - Deduplicated SDK loading, retry after transient failures, and cached auth tokens

## Supported Providers

| Provider                                       | Import path                          | Accounts                       |
| ---------------------------------------------- | ------------------------------------ | ------------------------------ |
| Dropbox                                        | `cloud-storage-picker/dropbox`      | Any Dropbox account            |
| Google Drive                                   | `cloud-storage-picker/google-drive` | Any Google account             |
| OneDrive                                       | `cloud-storage-picker/onedrive`     | Personal Microsoft accounts    |
| SharePoint / OneDrive for Business             | `cloud-storage-picker/sharepoint`   | Work or school accounts        |

## Installation

```bash
npm install cloud-storage-picker
```

```bash
pnpm add cloud-storage-picker
```

```bash
yarn add cloud-storage-picker
```

## Quick Start

```typescript
import { createPicker, isCancelledError } from "cloud-storage-picker";
import { dropboxProvider } from "cloud-storage-picker/dropbox";

const picker = createPicker({
  provider: dropboxProvider({
    appKey: "your-dropbox-app-key",
  }),
});

// Open the picker from a user gesture (e.g. a click handler) so
// popups and third-party dialogs are not blocked by the browser.
button.addEventListener("click", async () => {
  try {
    const files = await picker.open({ multiSelect: true });
    console.log(files);
    // [{ id: '...', name: 'document.pdf', link: 'https://...', rawData: {...} }]
  } catch (error) {
    if (isCancelledError(error)) return; // the user changed their mind
    console.error("Picker failed:", error);
  }
});
```

Every provider follows the same pattern — create it with your credentials, then call `open()`:

```typescript
import { googleDriveProvider } from "cloud-storage-picker/google-drive";
import { oneDriveProvider } from "cloud-storage-picker/onedrive";
import { sharePointProvider } from "cloud-storage-picker/sharepoint";

const googleDrive = googleDriveProvider({
  clientId: "your-google-client-id",
  apiKey: "your-google-api-key",
});

const oneDrive = oneDriveProvider({
  clientId: "your-azure-client-id",
});

const sharePoint = sharePointProvider({
  clientId: "your-azure-client-id",
  baseUrl: "https://contoso.sharepoint.com",
});
```

## Error Handling

All providers reject (or throw) a `PickerError` — never a plain `Error` — so you can branch on the `code` property instead of matching message strings:

```typescript
import { isCancelledError, isPickerError } from "cloud-storage-picker";

try {
  const files = await picker.open();
} catch (error) {
  if (isCancelledError(error)) {
    // The user dismissed the picker or declined to sign in. Not a failure.
    return;
  }

  if (isPickerError(error) && error.code === "popup_blocked") {
    // Ask the user to allow popups, then let them retry.
    return;
  }

  throw error;
}
```

| Code                      | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `cancelled`               | The user dismissed the picker or declined to sign in                        |
| `popup_blocked`           | The browser blocked a required popup — open the picker from a user gesture |
| `load_failed`             | A provider SDK script failed to load (network, CSP). Retrying is safe       |
| `auth_failed`             | Authentication or token acquisition failed                                  |
| `picker_failed`           | The provider's picker UI reported an error                                  |
| `invalid_config`          | The provider was created or opened with invalid configuration or options    |
| `unsupported_environment` | The picker was used outside a browser (e.g. during server-side rendering)   |

`PickerError` also carries the underlying error (when there is one) on its `cause` property.

## API Reference

### `createPicker(params)`

Creates a file picker instance for a given storage provider.

**Parameters:**

- `params.provider` - A storage provider instance (e.g., `dropboxProvider()` or `googleDriveProvider()`)

**Returns:**

- An object with an `open(options?)` method that returns a `Promise<FileData[]>`

### `FileData<T>`

The normalized file data structure returned by all providers:

```typescript
interface FileData<RawFileData> {
  id: string; // Unique identifier for the file
  name: string; // Name of the file
  link: string; // URL to access the file
  rawData: RawFileData; // Provider-specific raw file data
}
```

## Provider-Specific Documentation

### Dropbox Provider

Opens the [Dropbox Chooser](https://www.dropbox.com/developers/chooser).

#### Configuration

```typescript
dropboxProvider(config: DropboxConfig, options?: DropboxOptions)
```

**DropboxConfig:**

- `appKey` (required): Your Dropbox App Key. Get one from the [Dropbox App Console](https://www.dropbox.com/developers/apps).

**DropboxOptions:**

- `linkType`: `"preview"` | `"direct"` - Type of link to return (default: `"preview"`)
- `multiSelect`: `boolean` - Enable multiple file selection (default: `false`)
- `extensions`: `string[]` - Filter by file extensions or types (e.g., `[".pdf", "images"]`)
- `folderSelect`: `boolean` - Allow folder selection (default: `false`). Cannot be combined with `linkType: "direct"`
- `sizeLimit`: `number` - Maximum file size in bytes

**DropboxFileData:**

```typescript
interface DropboxFileData {
  id: string;
  name: string;
  bytes: number;
  isDir: boolean;
  link: string;
  linkType: "preview" | "direct";
  icon: string;
  thumbnailLink?: string;
}
```

#### Example

```typescript
const picker = createPicker({
  provider: dropboxProvider(
    { appKey: "your-app-key" },
    {
      multiSelect: true,
      extensions: [".pdf", ".docx", "images"],
      sizeLimit: 10 * 1024 * 1024, // 10MB
    },
  ),
});

const files = await picker.open();
```

### Google Drive Provider

Opens the [Google Picker](https://developers.google.com/workspace/drive/picker). Access tokens are cached per provider instance and reused until they are about to expire, so repeated `open()` calls do not re-prompt the user.

#### Configuration

```typescript
googleDriveProvider(config: GoogleDriveConfig, options?: GoogleDriveOptions)
```

**GoogleDriveConfig:**

- `clientId` (required): Your Google OAuth 2.0 Client ID
- `apiKey` (required): Your Google API Key
- `appId`: Your Google Cloud project number. Required when using the `drive.file` scope so picked files are shared with your app
- `scopes`: `string[]` - OAuth scopes to request (default: `["https://www.googleapis.com/auth/drive.readonly"]`)

Get credentials from the [Google Cloud Console](https://console.cloud.google.com/).

**GoogleDriveOptions:**

- `maxItems`: `number` - Maximum number of items a user can select
- `multiSelect`: `boolean` - Enable multiple file selection (default: `false`)
- `mimeTypes`: `string[]` - Filter by MIME types (e.g., `["application/pdf", "image/png"]`)
- `includeFolders`: `boolean` - Show folders in the picker (default: `false`)
- `locale`: `string` - ISO 639 language code used to localize the picker UI (e.g., `"en"`, `"fr"`)

**GoogleDriveFileData:**

```typescript
interface GoogleDriveFileData {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  sizeBytes?: number;
  iconUrl?: string;
  description?: string;
  lastEditedUtc?: number;
}
```

#### Example

```typescript
const picker = createPicker({
  provider: googleDriveProvider(
    {
      clientId: "your-client-id.apps.googleusercontent.com",
      apiKey: "your-api-key",
    },
    {
      multiSelect: true,
      mimeTypes: ["application/pdf"],
      maxItems: 3,
    },
  ),
});

const files = await picker.open();
```

### OneDrive Provider

Opens the [Microsoft File Picker](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers) for personal (consumer) OneDrive accounts. For work or school accounts, use the SharePoint provider instead.

#### Configuration

```typescript
oneDriveProvider(config: OneDriveConfig, options?: OneDriveOptions)
```

**OneDriveConfig:**

- `clientId` (required): The Application (client) ID of your Azure App Registration
- `redirectUri`: The SPA redirect URI registered for your app (default: current origin)

**OneDriveOptions:**

- `multiSelect`: `boolean` - Enable multiple file selection (default: `false`)
- `extensions`: `string[]` - Filter by file extensions (e.g., `[".pdf", ".docx"]`)
- `folderSelect`: `boolean` - Allow folder selection alongside files (default: `false`)

**OneDriveFileData:**

Items are shaped like [Microsoft Graph driveItem](https://learn.microsoft.com/en-us/graph/api/resources/driveitem) resources:

```typescript
interface OneDriveFileData {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  webDavUrl?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; id?: string };
}
```

#### Example

```typescript
const picker = createPicker({
  provider: oneDriveProvider(
    { clientId: "your-azure-client-id" },
    {
      multiSelect: true,
      extensions: [".pdf", ".docx"],
    },
  ),
});

const files = await picker.open();
```

### SharePoint Provider

Opens the [Microsoft File Picker](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers) for SharePoint document libraries and OneDrive for Business (work or school accounts).

#### Configuration

```typescript
sharePointProvider(config: SharePointConfig, options?: SharePointOptions)
```

**SharePointConfig:**

- `clientId` (required): The Application (client) ID of your Azure App Registration
- `baseUrl` (required): The SharePoint site to pick files from, e.g. `"https://contoso.sharepoint.com"` or `"https://contoso.sharepoint.com/sites/marketing"`. For a user's OneDrive for Business, use the MySite host, e.g. `"https://contoso-my.sharepoint.com"`
- `tenantId`: The directory (tenant) ID to authenticate against (default: `"organizations"`)
- `redirectUri`: The SPA redirect URI registered for your app (default: current origin)

**SharePointOptions** and **SharePointFileData** are identical to the OneDrive provider's.

#### Example

```typescript
const picker = createPicker({
  provider: sharePointProvider(
    {
      clientId: "your-azure-client-id",
      baseUrl: "https://contoso.sharepoint.com/sites/marketing",
    },
    { multiSelect: true },
  ),
});

const files = await picker.open();
```

## Advanced Usage

### Default Options

You can set default options when creating a provider and override them per call:

```typescript
const picker = createPicker({
  provider: dropboxProvider(
    { appKey: "your-app-key" },
    { multiSelect: false }, // Default
  ),
});

// Override defaults for specific calls
const singleFile = await picker.open(); // Uses multiSelect: false
const multipleFiles = await picker.open({ multiSelect: true }); // Override
```

### Accessing Raw Provider Data

Each `FileData` object includes a `rawData` property with the complete, unmodified response from the provider:

```typescript
const files = await picker.open();

files.forEach((file) => {
  console.log("Normalized:", file.id, file.name);
  console.log("Raw Dropbox data:", file.rawData);
  // Access provider-specific fields like bytes, icon, thumbnailLink, etc.
});
```

### Server-Side Rendering (Next.js, Nuxt, SvelteKit, ...)

The pickers rely on browser-only SDKs. Creating a provider is safe anywhere, but `open()` must run in the browser — call it from an event handler or a client-side effect. Calling `open()` on the server rejects with an `unsupported_environment` error rather than crashing your render.

### Popup Blockers

Google and Microsoft sign-in (and the Microsoft file picker itself) use popup windows. Always call `open()` synchronously from a user gesture such as a click handler; browsers block popups opened outside one. If a popup is still blocked, `open()` rejects with a `popup_blocked` error you can surface to the user.

### Content Security Policy

If your site uses a CSP, allow the provider SDKs you use under `script-src`:

- Dropbox: `https://www.dropbox.com`
- Google Drive: `https://apis.google.com` and `https://accounts.google.com`
- OneDrive / SharePoint: `https://alcdn.msauth.net` (MSAL)

If an SDK fails to load, `open()` rejects with a `load_failed` error; calling `open()` again retries the load.

## Setup Requirements

### Dropbox

1. Create an app at the [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Enable "Chooser" permissions
3. Add your domain to the allowed domains list
4. Copy your App Key

### Google Drive

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Picker API and Google Drive API
4. Create OAuth 2.0 credentials:
   - Add authorized JavaScript origins (e.g., `http://localhost:3000`)
5. Create an API Key
6. Copy your Client ID and API Key

### OneDrive / SharePoint

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com/) and register an application
2. Under "Supported account types":
   - For the OneDrive provider, choose an option that includes **personal Microsoft accounts**
   - For the SharePoint provider, choose an option that includes **work or school accounts**
3. Add a **Single-page application (SPA)** platform with your app's redirect URI (e.g., `http://localhost:3000`)
4. Under API permissions, add delegated permissions:
   - OneDrive (personal): `OneDrive.ReadWrite` (Microsoft Graph `Files.ReadWrite` also works)
   - SharePoint: SharePoint `AllSites.Read` (or `MyFiles.Read` for OneDrive for Business only)
5. Copy your Application (client) ID

Both providers load [MSAL](https://learn.microsoft.com/en-us/entra/identity-platform/msal-overview) on demand and prompt the user to sign in with a popup the first time the picker is opened.

## Development

```bash
pnpm install       # install dependencies
pnpm build         # build the library into dist/
pnpm dev           # rebuild on change and serve the demo page (index.html)
pnpm test          # run the test suite once
pnpm test:watch    # run tests in watch mode
pnpm typecheck     # type-check without emitting
```

The demo page (`index.html`) exercises every provider against the built output — fill in your own credentials before using it.

## License

MIT © [Melvin Otieno](https://melvinotieno.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository and create a feature branch
2. Make your changes, including tests for new behavior
3. Run `pnpm typecheck && pnpm test && pnpm build` before submitting
4. Open a Pull Request describing the change

## Links

- [GitHub Repository](https://github.com/melvinotieno/cloud-storage-picker)
- [Issue Tracker](https://github.com/melvinotieno/cloud-storage-picker/issues)
- [NPM Package](https://www.npmjs.com/package/cloud-storage-picker)

---

Made with ❤️ by [Melvin Otieno](https://melvinotieno.com)
