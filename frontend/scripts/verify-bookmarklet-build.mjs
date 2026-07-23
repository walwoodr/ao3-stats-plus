#!/usr/bin/env node
// Verifies bookmarklet.js's build/hosting contract from the plan
// (docs/plans/bookmarklet-entrypoint-and-hosting.md, task 5): after
// `npm run build`, bookmarklet.js must be emitted at the served root
// (dist/bookmarklet.js, alongside index.html - Option A hosts it from the
// SPA's own origin) as a self-contained IIFE with no React import, since
// InstallPage's loader fetches it as a plain <script src> on the AO3 page,
// not through a module graph that could resolve a separate React chunk.
//
// This is a lightweight Node script rather than a Vitest spec because it
// asserts on real build *output* (a file on disk after a real `vite build`
// run), which is a different concern from Vitest's in-memory unit/component
// tests - it's invoked as its own CI step, after the "Build" step, in
// .github/workflows/ci.yml.

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bookmarkletPath = path.join(frontendRoot, "dist", "bookmarklet.js");

const failures = [];

if (!existsSync(bookmarkletPath)) {
  console.error(`FAIL: ${bookmarkletPath} was not emitted by the build.`);
  console.error("Expected `npm run build` to produce dist/bookmarklet.js at the served root");
  console.error("(see frontend/vite.bookmarklet.config.ts and the build:bookmarklet script).");
  process.exit(1);
}

const source = readFileSync(bookmarkletPath, "utf-8");
const sizeInBytes = statSync(bookmarkletPath).size;

// A self-contained IIFE has no unresolved ES module syntax left in it -
// everything it needs is inlined. Bundled/minified `import`/`export`
// keywords surviving into the output would mean it isn't actually
// self-contained (e.g. accidentally built in ESM/library mode instead of
// `formats: ["iife"]`).
if (/\bimport\s/.test(source) || /\bexport\s/.test(source)) {
  failures.push("contains import/export syntax - expected a self-contained IIFE with none.");
}

// React elements/components carry a distinctive internal `$$typeof`
// property tag, and the React/ReactDOM dev bundles embed literal
// "react.element"/"react-dom" strings - either surviving into this file
// would mean entrypoint.ts (or something it imports) pulled in React,
// which it must not: the bookmarklet is a plain-DOM script, not a React
// app, and bundling React here would bloat every user's installed
// bookmarklet's payload for no reason.
if (/\$\$typeof/.test(source) || /react-dom/i.test(source)) {
  failures.push("appears to bundle React - the bookmarklet must be React-free.");
}

// Loose sanity bound, not a strict contract: a plain-DOM script wired to
// scrapeStats/buildIngestPayload/fetch/banners should be well under this:
// a much larger file is a strong signal something heavy (React, an
// entire other route) got pulled in by accident.
const MAX_REASONABLE_BYTES = 100 * 1024;
if (sizeInBytes > MAX_REASONABLE_BYTES) {
  failures.push(
    `is ${sizeInBytes} bytes, over the ${MAX_REASONABLE_BYTES}-byte sanity ceiling for a self-contained script.`,
  );
}

if (failures.length > 0) {
  console.error(`FAIL: dist/bookmarklet.js ${failures.join(" AND dist/bookmarklet.js ")}`);
  process.exit(1);
}

console.log(`OK: dist/bookmarklet.js is a self-contained, React-free IIFE (${sizeInBytes} bytes).`);
