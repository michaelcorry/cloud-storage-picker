import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "providers/dropbox": "src/providers/dropbox/index.ts",
    "providers/google-drive": "src/providers/google-drive/index.ts",
    "providers/onedrive": "src/providers/onedrive/index.ts",
    "providers/sharepoint": "src/providers/sharepoint/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
});
