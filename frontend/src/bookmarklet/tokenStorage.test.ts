import { afterEach, describe, expect, it } from "vitest";
import { getStoredReadToken, setStoredReadToken } from "./tokenStorage";

// tokenStorage persists the bookmarklet's readToken in AO3-origin
// localStorage (a different origin/store than the app's own useTokenStore),
// keyed per username so multiple AO3 accounts on the same browser don't
// clobber each other's tokens. Per the plan it must never throw even if
// localStorage itself is unavailable (e.g. Safari private browsing) -
// losing the persisted token is an acceptable degradation, a thrown
// exception that aborts the whole capture flow is not.
describe("tokenStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe("round-trip read/write keyed by username", () => {
    it("returns the token that was just stored for that username", () => {
      setStoredReadToken("someauthor", "tok_abc123");

      expect(getStoredReadToken("someauthor")).toBe("tok_abc123");
    });

    it("keeps tokens for different usernames independent", () => {
      setStoredReadToken("authorA", "tok_a");
      setStoredReadToken("authorB", "tok_b");

      expect(getStoredReadToken("authorA")).toBe("tok_a");
      expect(getStoredReadToken("authorB")).toBe("tok_b");
    });

    it("overwrites a previously stored token for the same username", () => {
      setStoredReadToken("someauthor", "tok_old");
      setStoredReadToken("someauthor", "tok_new");

      expect(getStoredReadToken("someauthor")).toBe("tok_new");
    });

    it("namespaces the localStorage key so it doesn't collide with unrelated keys", () => {
      setStoredReadToken("someauthor", "tok_abc123");

      expect(localStorage.getItem("ao3-stats-plus:readToken:someauthor")).toBe("tok_abc123");
    });
  });

  describe("a missing key", () => {
    it("returns undefined rather than null or throwing", () => {
      expect(getStoredReadToken("never-stored-user")).toBeUndefined();
    });
  });

  describe("when localStorage is unavailable", () => {
    // Simulates Safari private-mode/embedded-webview behavior, where merely
    // accessing window.localStorage throws a SecurityError rather than the
    // property simply being undefined.
    function makeLocalStorageThrow() {
      const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
      return () => {
        if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
      };
    }

    it("does not throw when reading and returns undefined", () => {
      const restore = makeLocalStorageThrow();
      try {
        expect(() => getStoredReadToken("someauthor")).not.toThrow();
        expect(getStoredReadToken("someauthor")).toBeUndefined();
      } finally {
        restore();
      }
    });

    it("does not throw when writing", () => {
      const restore = makeLocalStorageThrow();
      try {
        expect(() => setStoredReadToken("someauthor", "tok_abc123")).not.toThrow();
      } finally {
        restore();
      }
    });
  });
});
