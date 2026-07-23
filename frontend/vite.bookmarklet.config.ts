import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// A second, separate Vite config for bookmarklet.js: a plain-DOM IIFE
// script injected into the AO3 page itself (see src/bookmarklet/
// entrypoint.ts), built and hosted independently from the React SPA in the
// default vite.config.ts. `emptyOutDir: false` because this build runs
// *after* the SPA build (see package.json's `build` script) and must not
// wipe out its output - both land in dist/, so bookmarklet.js ends up
// served from the SPA's own origin at /bookmarklet.js (Option A in
// docs/plans/bookmarklet-entrypoint-and-hosting.md). The API origin is
// baked in via import.meta.env.VITE_API_ORIGIN, resolved the same way Vite
// resolves it for the main app build (.env* files / process.env).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(dirname, "src/bookmarklet/entrypoint.ts"),
      name: "Ao3StatsPlusBookmarklet",
      formats: ["iife"],
      fileName: () => "bookmarklet.js",
    },
  },
});
