import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSuccessBanner, type SaveTokenResult } from "./banners";

// Split out of banners.test.ts (TECH_DEBT.md, 2026-08-03: that file exceeded
// CODE_STANDARDS.md's 400-line .ts budget) - renderSuccessBanner's own
// describe blocks (including its "Save token" sub-flow and visual
// treatment), the single largest concern in the original file, mirroring
// fanOut.test.ts's existing split-by-scenario-group convention.
//
// Per docs/plans/memorable-token-and-recovery.md section 4/7/10 (task 14):
// the token is now an editable text input (not a read-only <code> block),
// with a Save action that rotates the token via a caller-supplied
// onSaveToken callback - mirroring the existing onRetry callback pattern
// used by renderRetryBanner, so banners.ts stays decoupled from knowing
// about apiOrigin/fetch/tokenUpdateClient directly. The dashboard URL is
// built from frontendOrigin + username + the *current* token (initially,
// then recomputed after a successful Save), URL-encoding the token - unlike
// today's unencoded hex, a user-typed word-pair (or anything else a user
// types) can contain URL-significant characters.
describe("renderSuccessBanner", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

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

describe("renderSuccessBanner visual treatment", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

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
