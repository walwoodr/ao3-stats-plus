import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";

// vite.bookmarklet.config.ts's env-validation branch only runs inside a
// real `vite build`, which loads .env*/process.env itself via `loadEnv`.
// Mocking `loadEnv` here lets this spec exercise both the missing- and
// present-VITE_API_ORIGIN branches directly, without shelling out to a
// real build (that's covered separately by scripts/verify-bookmarklet-build.mjs
// and by manual verification - see the plan/PR notes).
const loadEnvMock = vi.fn();
vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vite")>();
  return { ...actual, loadEnv: loadEnvMock };
});

type BookmarkletConfigFn = (env: ConfigEnv) => UserConfig;

const CONFIG_ENV: ConfigEnv = { mode: "production", command: "build" };

describe("vite.bookmarklet.config", () => {
  beforeEach(() => {
    loadEnvMock.mockReset();
    vi.resetModules();
  });

  it("throws a descriptive error when VITE_API_ORIGIN is unset", async () => {
    loadEnvMock.mockReturnValue({});
    const { default: config } = await import("./vite.bookmarklet.config");

    expect(() => (config as BookmarkletConfigFn)(CONFIG_ENV)).toThrow(/VITE_API_ORIGIN is not set/);
  });

  it("throws when VITE_API_ORIGIN is set to an empty string", async () => {
    loadEnvMock.mockReturnValue({ VITE_API_ORIGIN: "" });
    const { default: config } = await import("./vite.bookmarklet.config");

    expect(() => (config as BookmarkletConfigFn)(CONFIG_ENV)).toThrow(/VITE_API_ORIGIN is not set/);
  });

  it("returns the lib build config when VITE_API_ORIGIN is set", async () => {
    loadEnvMock.mockReturnValue({ VITE_API_ORIGIN: "https://api.example.test" });
    const { default: config } = await import("./vite.bookmarklet.config");

    const result = (config as BookmarkletConfigFn)(CONFIG_ENV);

    expect(result.build?.outDir).toBe("dist");
    expect(result.build?.emptyOutDir).toBe(false);
    expect(
      result.build?.lib && "fileName" in result.build.lib && result.build.lib.fileName,
    ).toBeTypeOf("function");
  });
});
