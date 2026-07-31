#!/usr/bin/env node
// Convenience for "Testing the bookmarklet against real AO3" (README.md):
// opens a Cloudflare Quick Tunnel to the local Rails server and writes the
// resulting random *.trycloudflare.com URL into .env.local as
// VITE_API_ORIGIN/VITE_GRAPHQL_URL, so that fiddly hand-edit (easy to typo,
// or forget the /graphql suffix on one of the two) doesn't have to happen
// every time the tunnel restarts with a new subdomain. It does not need to
// touch FRONTEND_ORIGINS on the backend - config/initializers/cors.rb's
// local-dev default already wildcards any *.trycloudflare.com origin.
//
// Usage: npm run tunnel:backend [-- <port>]   (defaults to 3000)

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envLocalPath = path.join(frontendRoot, ".env.local");
const envExamplePath = path.join(frontendRoot, ".env.example");

const port = process.argv[2] ?? "3000";
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// Replaces VITE_API_ORIGIN/VITE_GRAPHQL_URL in .env.local in place (leaving
// every other line - other local overrides, comments - untouched), creating
// the file from .env.example first if it doesn't exist yet.
function writeEnvLocal(backendUrl) {
  if (!existsSync(envLocalPath)) {
    copyFileSync(envExamplePath, envLocalPath);
  }
  const updates = {
    VITE_API_ORIGIN: backendUrl,
    VITE_GRAPHQL_URL: `${backendUrl}/graphql`,
  };
  const seen = new Set();
  const lines = readFileSync(envLocalPath, "utf8")
    .split("\n")
    .map((line) => {
      const match = /^([A-Z_]+)=/.exec(line);
      if (match && match[1] in updates) {
        seen.add(match[1]);
        return `${match[1]}=${updates[match[1]]}`;
      }
      return line;
    });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  writeFileSync(envLocalPath, lines.join("\n"));
}

console.log(`Opening a Cloudflare Quick Tunnel for http://localhost:${port} ...\n`);

const cloudflared = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`]);

let handled = false;

function handleOutput(chunk) {
  process.stderr.write(chunk);
  if (handled) return;
  const match = TUNNEL_URL_PATTERN.exec(chunk.toString());
  if (!match) return;

  handled = true;
  const backendUrl = match[0];
  writeEnvLocal(backendUrl);

  console.log(`\nBackend tunnel: ${backendUrl}`);
  console.log("Wrote VITE_API_ORIGIN and VITE_GRAPHQL_URL into .env.local.\n");
  console.log("Next steps:");
  console.log("  1. npm run build && npm run preview");
  console.log("  2. In another terminal: npm run tunnel:preview");
  console.log(
    "  3. Visit InstallPage via the preview tunnel URL (not localhost) and install/click the bookmarklet.",
  );
  console.log(
    "\nFRONTEND_ORIGINS on the backend doesn't need setting for this - see config/initializers/cors.rb.\n",
  );
  console.log("Leave this running (Ctrl+C to stop the tunnel).\n");
}

cloudflared.stdout.on("data", handleOutput);
cloudflared.stderr.on("data", handleOutput);

cloudflared.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("cloudflared not found on PATH. Install it with: brew install cloudflared");
    process.exit(1);
  }
  throw err;
});

cloudflared.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => cloudflared.kill("SIGINT"));
