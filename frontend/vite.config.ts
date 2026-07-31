/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig(({ command, mode }) => {
  // A production build must not silently ship the dashboard pointed at
  // localhost:3000 if VITE_GRAPHQL_URL was forgotten - graphqlClient.ts's
  // fallback to localhost exists for `vite dev` (a genuinely correct
  // default there), not for a real build. Mirrors
  // vite.bookmarklet.config.ts's identical check for VITE_API_ORIGIN.
  // Gated on `command === "build"` (not just presence of the file) so
  // `vite dev`/`vite test` are unaffected - the dev-time fallback stays
  // intact there. `.env.local` already sets VITE_GRAPHQL_URL for local
  // builds (see .env.example); CI sets it explicitly for the same reason
  // it sets VITE_API_ORIGIN.
  if (command === "build") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    if (!env.VITE_GRAPHQL_URL) {
      throw new Error(
        "VITE_GRAPHQL_URL is not set. A production build must not silently ship the " +
          "dashboard pointed at localhost:3000 - set VITE_GRAPHQL_URL in .env.local (copy " +
          ".env.example) for local builds, or in the build environment (e.g. CI) before " +
          "running `npm run build`.",
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Allow Cloudflare Tunnel's rotating random *.trycloudflare.com
      // subdomains through Vite's Host header check (also applies to `vite
      // preview`, which inherits this unless overridden), so the server is
      // reachable via a public tunnel for manual bookmarklet testing against
      // live AO3 - see README.md, "Testing the bookmarklet against real AO3".
      // A different tunnel provider's domain would need adding here too.
      allowedHosts: [".trycloudflare.com"],
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            environment: "jsdom",
            globals: true,
            setupFiles: "./src/test/setup.ts",
            // Exclude the Playwright e2e suite (tests/) - those specs use
            // Playwright's own `test()` and are run via `npm run test:e2e`,
            // not Vitest.
            exclude: ["tests/**", "**/node_modules/**"],
          },
        },
        {
          extends: true,
          plugins: [
            // The plugin will run tests for the stories defined in your Storybook config
            // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
            storybookTest({
              configDir: path.join(dirname, ".storybook"),
            }),
          ],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [
                {
                  browser: "chromium",
                },
              ],
            },
          },
        },
      ],
    },
  };
});
