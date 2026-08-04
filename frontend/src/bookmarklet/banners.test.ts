import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFailureBanner,
  renderInfoBanner,
  renderProgressBanner,
  renderRetryBanner,
  renderSuccessBanner,
  renderSummaryBanner,
  renderUnauthorizedBanner,
  updateProgressBanner,
  type SaveTokenResult,
} from "./banners";

// The bookmarklet's confirmation/failure banners are injected into the AO3
// page itself, since that's where the user is at success/failure time. Per
// the plan: the success banner shows the readToken as visible, copyable
// text plus a link to the dashboard; failure banners are accessible
// (role="alert" so screen readers announce them) and keyboard-operable.
describe("bookmarklet banners", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // Per docs/plans/memorable-token-and-recovery.md section 4/7/10 (task 14):
  // the token is now an editable text input (not a read-only <code> block),
  // with a Save action that rotates the token via a caller-supplied
  // onSaveToken callback - mirroring the existing onRetry callback pattern
  // used by renderRetryBanner, so banners.ts stays decoupled from knowing
  // about apiOrigin/fetch/tokenUpdateClient directly. The dashboard URL is
  // built from frontendOrigin + username + the *current* token (initially,
  // then recomputed after a successful Save), URL-encoding the token -
  // unlike today's unencoded hex, a user-typed word-pair (or anything else
  // a user types) can contain URL-significant characters.
  describe("renderSuccessBanner", () => {
    function successBannerData(
      overrides: {
        readToken?: string;
        frontendOrigin?: string;
        username?: string;
        onSaveToken?: (newToken: string) => Promise<SaveTokenResult>;
      } = {},
    ) {
      return {
        readToken: overrides.readToken ?? "cat-dog",
        frontendOrigin: overrides.frontendOrigin ?? "https://app.example.com",
        username: overrides.username ?? "someauthor",
        onSaveToken:
          overrides.onSaveToken ?? vi.fn().mockResolvedValue({ ok: true, readToken: "cat-dog" }),
      };
    }

    it("displays the read token as visible, editable text (not a read-only <code> block)", () => {
      renderSuccessBanner(container, successBannerData({ readToken: "tok_visible_123" }));

      expect(container.querySelector("code")).toBeNull();
      const input = container.querySelector("input[type='text']") as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.value).toBe("tok_visible_123");
      expect(input?.readOnly).toBe(false);
      expect(input?.disabled).toBe(false);
    });

    it("associates a real <label> with the input via label[for]/input#id", () => {
      renderSuccessBanner(container, successBannerData());

      const input = container.querySelector("input[type='text']") as HTMLInputElement;
      const label = container.querySelector("label");

      expect(input.id).toBeTruthy();
      expect(label?.getAttribute("for")).toBe(input.id);
      expect(label?.textContent).toMatch(/token/i);
    });

    it("sets token-appropriate input semantics (not treated as prose)", () => {
      renderSuccessBanner(container, successBannerData());

      const input = container.querySelector("input[type='text']") as HTMLInputElement;

      expect(input.autocomplete).toBe("off");
      expect(input.spellcheck).toBe(false);
      expect(input.getAttribute("autocapitalize")).toBe("off");
    });

    // The visible bordered box around the input+Copy button is the wrapper
    // div (inputStyle) - the <input> itself (internalInputStyle) has
    // border:none, so it has no border to visibly ring. The focus-ring
    // effect must therefore mutate the wrapper's border/box-shadow, not the
    // input's (which would be a no-op with nothing rendered to show for it).
    it("applies the focus ring to the bordered input wrapper, not the borderless inner input", () => {
      renderSuccessBanner(container, successBannerData());

      const input = container.querySelector("input[type='text']") as HTMLInputElement;
      const wrapper = input.parentElement as HTMLElement;

      input.focus();
      expect(wrapper.style.boxShadow).not.toBe("");
      expect(wrapper.style.boxShadow).not.toBe("none");
      expect(input.style.boxShadow).toBe("none");

      input.blur();
      expect(wrapper.style.boxShadow).toBe("none");
    });

    it("links to the dashboard URL built from frontendOrigin, username, and the current token (URL-encoded)", () => {
      renderSuccessBanner(
        container,
        successBannerData({
          readToken: "cat dog", // contains a URL-significant character
          frontendOrigin: "https://app.example.com",
          username: "someauthor",
        }),
      );

      const link = container.querySelector("a");
      expect(link?.getAttribute("href")).toBe(
        `https://app.example.com/u/someauthor?token=${encodeURIComponent("cat dog")}`,
      );
    });

    // The Copy button is an icon glyph ("⧉"), not a text label, so its
    // accessible name comes from aria-label (not textContent, and not
    // title - title is not the accessible name computation source for a
    // <button> with text/glyph content, so asserting on it would pass even
    // if a screen reader announced the meaningless glyph instead of "Copy").
    it("provides a keyboard-operable Copy button", () => {
      renderSuccessBanner(container, successBannerData());

      const copyButton = Array.from(container.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-label") === "Copy",
      );
      expect(copyButton?.tagName).toBe("BUTTON");
      expect(copyButton?.getAttribute("tabindex")).not.toBe("-1");
    });

    it("copies the CURRENT input value to the clipboard, not the original prop, once the user has edited it", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      renderSuccessBanner(container, successBannerData({ readToken: "tok_visible_123" }));
      const input = container.querySelector("input[type='text']") as HTMLInputElement;
      input.value = "fox-owl";
      const copyButton = Array.from(container.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-label") === "Copy",
      );
      copyButton?.click();

      expect(writeText).toHaveBeenCalledWith("fox-owl");
      expect(writeText).not.toHaveBeenCalledWith("tok_visible_123");
    });

    it("confirms the copy visibly rather than leaving the button unchanged", () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      renderSuccessBanner(container, successBannerData());
      const copyButton = Array.from(container.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-label") === "Copy",
      );
      copyButton?.click();

      expect(copyButton?.getAttribute("aria-label")).toMatch(/copied/i);
    });

    it("uses an accessible status role so screen readers announce success", () => {
      const banner = renderSuccessBanner(container, successBannerData());

      expect(banner.getAttribute("role")).toBe("status");
    });

    it("moves focus to the banner so keyboard/screen-reader users notice it", () => {
      const banner = renderSuccessBanner(container, successBannerData());

      expect(document.activeElement).toBe(banner);
    });

    describe("Save token", () => {
      // /sav/i (not /save/i) so this still finds the button once its own
      // text changes to "Saving..." while a save is in flight - "saving"
      // has no "save" substring ("sav" + "ing", not "sav" + "e").
      function saveButton() {
        return Array.from(container.querySelectorAll("button")).find((b) =>
          /sav/i.test(b.textContent ?? ""),
        );
      }

      it("calls onSaveToken with the current (trimmed) input value when clicked", async () => {
        const onSaveToken = vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "fox-owl" } satisfies SaveTokenResult);
        renderSuccessBanner(container, successBannerData({ onSaveToken }));
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "  fox-owl  ";

        saveButton()?.click();
        await vi.waitFor(() => expect(onSaveToken).toHaveBeenCalled());

        expect(onSaveToken).toHaveBeenCalledWith("fox-owl");
      });

      it("does not call onSaveToken when the input is blank or whitespace-only", () => {
        const onSaveToken = vi.fn();
        renderSuccessBanner(container, successBannerData({ onSaveToken }));
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "   ";

        saveButton()?.click();

        expect(onSaveToken).not.toHaveBeenCalled();
      });

      it("disables the Save button while the request is in flight", async () => {
        let resolveSave!: (value: SaveTokenResult) => void;
        const onSaveToken = vi.fn(
          () =>
            new Promise<SaveTokenResult>((resolve) => {
              resolveSave = resolve;
            }),
        );
        renderSuccessBanner(container, successBannerData({ onSaveToken }));

        saveButton()?.click();
        await vi.waitFor(() => expect(saveButton()?.disabled).toBe(true));

        resolveSave({ ok: true, readToken: "cat-dog" });
      });

      it("re-enables the Save button and announces 'Token saved' via a polite live region on success", async () => {
        const onSaveToken = vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "fox-owl" } satisfies SaveTokenResult);
        renderSuccessBanner(container, successBannerData({ onSaveToken }));
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "fox-owl";

        saveButton()?.click();
        await vi.waitFor(() => expect(saveButton()?.disabled).toBe(false));

        const liveRegion = container.querySelector("[aria-live='polite']");
        expect(liveRegion?.textContent).toMatch(/token saved/i);
      });

      it("updates the dashboard link's ?token= param (URL-encoded) to the newly saved token on success", async () => {
        const onSaveToken = vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "new token" } satisfies SaveTokenResult);
        renderSuccessBanner(
          container,
          successBannerData({
            onSaveToken,
            frontendOrigin: "https://app.example.com",
            username: "someauthor",
          }),
        );
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "new token";

        saveButton()?.click();
        await vi.waitFor(() => expect(saveButton()?.disabled).toBe(false));

        const link = container.querySelector("a");
        expect(link?.getAttribute("href")).toBe(
          `https://app.example.com/u/someauthor?token=${encodeURIComponent("new token")}`,
        );
      });

      it("shows an assertive role=alert error, preserves the typed value, and re-enables Save on failure", async () => {
        const onSaveToken = vi.fn().mockResolvedValue({
          ok: false,
          message: "Could not save token",
        } satisfies SaveTokenResult);
        renderSuccessBanner(container, successBannerData({ onSaveToken }));
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "attempted-token";

        saveButton()?.click();
        await vi.waitFor(() => expect(saveButton()?.disabled).toBe(false));

        const alert = container.querySelector("[role='alert']");
        expect(alert?.textContent).toMatch(/could not save token/i);
        expect(input.value).toBe("attempted-token");
        expect(saveButton()?.disabled).toBe(false);
      });

      it("triggers Save when Enter is pressed inside the input, without navigating", async () => {
        const onSaveToken = vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "fox-owl" } satisfies SaveTokenResult);
        renderSuccessBanner(container, successBannerData({ onSaveToken }));
        const input = container.querySelector("input[type='text']") as HTMLInputElement;
        input.value = "fox-owl";

        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        input.dispatchEvent(event);
        await vi.waitFor(() => expect(onSaveToken).toHaveBeenCalled());

        expect(event.defaultPrevented).toBe(true);
      });
    });

    it("keeps the input, Copy, Save, and dashboard link in a sensible (natural DOM) tab order", () => {
      renderSuccessBanner(container, successBannerData());

      const focusable = Array.from(container.querySelectorAll("input, button, a"));
      const tagOrder = focusable.map((el) => el.tagName);

      expect(tagOrder).toEqual(["INPUT", "BUTTON", "BUTTON", "A"]);
      // None of these should be pulled out of the natural tab order via a
      // positive tabindex, and none should be hidden from it via -1 either
      // (only the outer banner itself uses tabindex="-1", to move focus
      // there programmatically without adding it to the Tab sequence).
      for (const el of focusable) {
        expect(el.getAttribute("tabindex")).not.toBe("-1");
      }
    });
  });

  describe("renderFailureBanner (scrape failure)", () => {
    it("explains the layout may have changed and includes the schemaVersion", () => {
      const banner = renderFailureBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed",
        schemaVersion: 1,
      });

      expect(banner.textContent).toContain("Couldn't read your stats page");
      expect(banner.textContent).toContain("1");
    });

    it("uses an alert role so screen readers announce it immediately", () => {
      const banner = renderFailureBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed",
        schemaVersion: 1,
      });

      expect(banner.getAttribute("role")).toBe("alert");
    });

    // The schemaVersion is a debugging detail, not something a non-technical
    // reader needs to parse alongside the actual problem - it must not be
    // concatenated into the primary message sentence.
    it("keeps the schemaVersion out of the primary message text", () => {
      const banner = renderFailureBanner(container, {
        message: "This bookmarklet is out of date - please reinstall it.",
        schemaVersion: 1,
      });

      const message = banner.querySelector("p");
      expect(message?.textContent).toBe("This bookmarklet is out of date - please reinstall it.");
    });
  });

  // renderInfoBanner fills the banner-naming gap the plan calls out: scrape
  // failures (no-works / not-all-years / scrape-failed) are informational,
  // pre-POST outcomes with no schemaVersion in play, so reusing
  // renderFailureBanner (which always appends a "(schemaVersion N)" suffix)
  // would be a misleading, semantically-wrong fit for them.
  describe("renderInfoBanner (scrape-failure/informational messages)", () => {
    it("renders the given message", () => {
      const banner = renderInfoBanner(container, {
        message: "You don't have any works yet, so there's nothing to capture.",
      });

      expect(banner.textContent).toContain("You don't have any works yet");
    });

    it("does not append a schemaVersion suffix", () => {
      const banner = renderInfoBanner(container, {
        message: "Please switch to the 'All Years' view before capturing your stats.",
      });

      expect(banner.textContent).not.toMatch(/schemaVersion/i);
    });

    it("uses an accessible role so screen readers announce it", () => {
      const banner = renderInfoBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed.",
      });

      expect(["status", "alert"]).toContain(banner.getAttribute("role"));
    });
  });

  describe("renderRetryBanner (network/POST failure)", () => {
    it("renders a keyboard-operable Retry button", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      const retryButton = container.querySelector("button");
      retryButton?.focus();
      expect(document.activeElement).toBe(retryButton);
    });

    it("calls onRetry when the Retry button is clicked", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      container.querySelector("button")?.click();

      expect(onRetry).toHaveBeenCalledOnce();
    });

    it("calls onRetry when the Retry button is activated via the keyboard", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      const retryButton = container.querySelector("button") as HTMLButtonElement;
      retryButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      expect(onRetry).toHaveBeenCalledOnce();
    });
  });

  describe("renderUnauthorizedBanner (403/CORS rejection)", () => {
    it("explains the bookmarklet is unauthorized or out of date", () => {
      const banner = renderUnauthorizedBanner(container, {
        message: "This bookmarklet is out of date or not authorized - please reinstall it.",
      });

      expect(banner.textContent).toMatch(/out of date|not authorized/i);
      expect(banner.getAttribute("role")).toBe("alert");
    });
  });

  // renderProgressBanner is the Phase 2 fan-out's live-progress indicator
  // (plan section 8): a polite live region that updates *in place* as each
  // work is processed, rather than spamming a new alert node per work - a
  // screen-reader user should hear periodic progress, not a flood.
  describe("renderProgressBanner (Phase 2 fan-out live progress)", () => {
    it("renders the initial progress message", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(banner.textContent).toMatch(/12/);
    });

    it("uses a polite live region, not an assertive alert, so progress doesn't interrupt the user", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(banner.getAttribute("role")).toBe("status");
      expect(banner.getAttribute("aria-live")).toBe("polite");
    });

    it("does not move focus (unlike the success banner) - progress shouldn't steal keyboard focus repeatedly", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(document.activeElement).not.toBe(banner);
    });
  });

  describe("updateProgressBanner (updates in place, no new DOM node per work)", () => {
    it("updates the existing banner's text to reflect the new current/total", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 3, total: 5 });

      expect(banner.textContent).toMatch(/3/);
      expect(banner.textContent).toMatch(/5/);
    });

    it("does not append any additional banner nodes to the container", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 2, total: 5 });
      updateProgressBanner(banner, { current: 3, total: 5 });

      expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(banner.isConnected).toBe(true);
    });

    it("keeps the same aria-live polite status role after updating", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 2, total: 5 });

      expect(banner.getAttribute("role")).toBe("status");
      expect(banner.getAttribute("aria-live")).toBe("polite");
    });
  });

  // renderSummaryBanner is the final report once the fan-out finishes (or
  // is capped/circuit-broken) - plan section 7: "Saved further data for X of M, Y
  // skipped" plus any truncation, so partial success (the normal operating
  // mode under fan-out) is always visible, never silently swallowed.
  describe("renderSummaryBanner (Phase 2 fan-out final report)", () => {
    it("reports the enriched, skipped, and total counts", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 8,
        skipped: 2,
        total: 10,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/8/);
      expect(banner.textContent).toMatch(/2/);
    });

    it("surfaces truncation rather than silently dropping it", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 3,
        skipped: 0,
        total: 3,
        truncatedWorks: true,
        truncatedBookmarkPagesCount: 1,
        circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/truncat/i);
    });

    it("surfaces a circuit-broken run distinctly from an ordinary partial-success summary", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 1,
        skipped: 4,
        total: 5,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: true,
      });

      expect(banner.textContent).toMatch(/stopped|circuit|paused/i);
    });

    it("uses an accessible status role so screen readers announce the final result", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 5,
        skipped: 0,
        total: 5,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      expect(banner.getAttribute("role")).toBe("status");
    });
  });

  // Regression coverage for the "unreadable and very ugly" report: a shared
  // base gave every banner readable typography plus a flex-column layout
  // (so multi-element banners get consistent gap-based spacing instead of
  // elements crammed against each other), across all five variants.
  describe("shared banner readability/layout styling", () => {
    it("gives every banner variant a readable font size/line-height and consistent flex-column spacing", () => {
      const banners = [
        renderSuccessBanner(container, {
          readToken: "tok_visible_123",
          frontendOrigin: "https://app.example.com",
          username: "someauthor",
          onSaveToken: vi.fn().mockResolvedValue({
            ok: true,
            readToken: "tok_visible_123",
          } satisfies SaveTokenResult),
        }),
        renderFailureBanner(container, { message: "failure", schemaVersion: 1 }),
        renderInfoBanner(container, { message: "info" }),
        renderRetryBanner(container, { message: "retry", onRetry: vi.fn() }),
        renderUnauthorizedBanner(container, { message: "unauthorized" }),
      ];

      for (const banner of banners) {
        expect(banner.style.display).toBe("flex");
        expect(banner.style.flexDirection).toBe("column");
        expect(banner.style.gap).not.toBe("");
        expect(banner.style.lineHeight).not.toBe("");
        expect(banner.style.fontSize).not.toBe("");
      }
    });
  });

  describe("renderSuccessBanner visual treatment", () => {
    // MASTER.md's Inputs spec (plan section 4): monospace value font (the
    // token is a figure to be transcribed precisely) and font-size 16px
    // explicitly - MASTER.md calls this out as "never smaller", to avoid
    // iOS Safari auto-zooming into the field on focus.
    it("gives the token input a monospace font at 16px so it never triggers iOS auto-zoom", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        frontendOrigin: "https://app.example.com",
        username: "someauthor",
        onSaveToken: vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "tok_visible_123" } satisfies SaveTokenResult),
      });

      const input = container.querySelector("input[type='text']") as HTMLInputElement;
      expect(input.style.fontFamily).toMatch(/mono/i);
      expect(input.style.fontSize).toBe("16px");
    });

    it("styles the Copy button, Save button, and dashboard link as clearly clickable, not bare browser defaults", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        frontendOrigin: "https://app.example.com",
        username: "someauthor",
        onSaveToken: vi
          .fn()
          .mockResolvedValue({ ok: true, readToken: "tok_visible_123" } satisfies SaveTokenResult),
      });

      const buttons = container.querySelectorAll("button");
      const link = container.querySelector("a");

      for (const button of buttons) {
        const styled = button.style.backgroundColor !== "" || button.style.border !== "";
        expect(styled).toBe(true);
      }
      expect(link?.style.textDecoration).toBe("none");
      expect(link?.style.border).not.toBe("");
    });
  });

  describe("renderRetryBanner visual treatment", () => {
    it("styles the Retry button as clearly clickable, not a bare browser default", () => {
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry: vi.fn() });

      const retryButton = container.querySelector("button");
      expect(retryButton?.style.backgroundColor).not.toBe("");
    });
  });

  // Every banner used to be independently position:fixed at the same
  // top:1rem;right:1rem spot, so a second banner (e.g. runFanOut's summary
  // banner, rendered without removing its own progress banner - see
  // fanOut.ts) landed exactly on top of the first instead of below it. All
  // banners now render into one shared fixed-position stack that lays its
  // children out in a column, so multiple simultaneous banners visibly
  // stack down the Y axis instead of overlapping.
  describe("banner stacking wrapper", () => {
    it("renders multiple banners into one shared wrapper, not as separate top-level fixed banners", () => {
      renderInfoBanner(container, { message: "First" });
      renderRetryBanner(container, { message: "Second", onRetry: vi.fn() });

      const stacks = container.querySelectorAll("[data-ao3-stats-plus-banner-stack]");
      expect(stacks).toHaveLength(1);

      const stack = stacks[0];
      expect(stack.children).toHaveLength(2);
      expect(stack.children[0].textContent).toContain("First");
      expect(stack.children[1].textContent).toContain("Second");
    });

    it("gives the shared wrapper (not each individual banner) the fixed positioning and column layout", () => {
      renderInfoBanner(container, { message: "First" });
      renderRetryBanner(container, { message: "Second", onRetry: vi.fn() });

      const stack = container.querySelector(
        "[data-ao3-stats-plus-banner-stack]",
      ) as HTMLElement | null;
      expect(stack?.style.position).toBe("fixed");
      expect(stack?.style.flexDirection).toBe("column");
      expect(stack?.style.gap).not.toBe("");

      for (const banner of Array.from(stack?.children ?? [])) {
        expect((banner as HTMLElement).style.position).not.toBe("fixed");
      }
    });

    it("reuses the same wrapper across every banner type (success, failure, progress, summary, etc.)", () => {
      renderProgressBanner(container, { current: 1, total: 3 });
      renderSuccessBanner(container, {
        readToken: "cat-dog",
        frontendOrigin: "https://app.example.com",
        username: "someauthor",
        onSaveToken: vi.fn().mockResolvedValue({ ok: true, readToken: "cat-dog" }),
      });
      renderSummaryBanner(container, {
        enriched: 2,
        skipped: 1,
        total: 3,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      const stacks = container.querySelectorAll("[data-ao3-stats-plus-banner-stack]");
      expect(stacks).toHaveLength(1);
      expect(stacks[0].children).toHaveLength(3);
    });
  });
});
