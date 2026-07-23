import { defineConfig, loadEnv } from "vite";
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
export default defineConfig(({ mode }) => {
  // Fail the build loudly rather than silently baking `undefined` into
  // bookmarklet.js. Vite normally inlines an unset import.meta.env.VITE_*
  // reference as `void 0` and moves on - fine for app code with a runtime
  // fallback, but fatal here: entrypoint.ts POSTs to
  // `${apiOrigin}/ingest`, and an inlined `undefined` resolves that fetch
  // relative to whatever page injected the script (the real AO3 page),
  // silently breaking every capture with no build-time signal. loadEnv
  // reads the same .env*/process.env sources Vite would use to resolve
  // import.meta.env.VITE_API_ORIGIN for this build's `mode`.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiOrigin = env.VITE_API_ORIGIN;
  if (!apiOrigin) {
    throw new Error(
      "VITE_API_ORIGIN is not set. bookmarklet.js bakes this in at build time as the " +
        "target of its /ingest POST - building without it would silently produce a " +
        "broken bookmarklet. Set VITE_API_ORIGIN in .env.local (copy .env.example) for " +
        "local builds, or in the build environment (e.g. CI) before running " +
        "`npm run build` / `npm run build:bookmarklet`.",
    );
  }

  return {
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
  };
});
