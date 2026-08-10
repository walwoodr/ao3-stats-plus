import { describe, expect, it } from "vitest";
import { inputButton, primaryButtonStyle } from "./bannerStyles";

// TECH_DEBT.md (2026-07-23): inputButton (unlike primaryButtonStyle) used to
// omit any padding, so the icon-only Copy button's hit target was only as
// large as its glyph at font-size 1rem (~16px) - well short of the common
// ~44x44 CSS px WCAG/mobile touch-target minimum. Fixed via explicit
// min-width/min-height (not padding alone, since a lone glyph has no text
// to naturally pad the box out to a comfortable target size).
describe("inputButton", () => {
  it("guarantees a >=44px minimum width and height for a touch-comfortable target", () => {
    const style = document.createElement("button").style;
    style.cssText = inputButton("#fff", "#000");

    // getPropertyValue is more reliable than reading cssText via regex -
    // jsdom parses the assigned cssText into real CSSStyleDeclaration
    // properties.
    const minWidth = parseFloat(style.getPropertyValue("min-width"));
    const minHeight = parseFloat(style.getPropertyValue("min-height"));
    const remPx = 16; // this codebase's rem base (see internalInputStyle's 16px note)

    expect(minWidth * remPx).toBeGreaterThanOrEqual(44);
    expect(minHeight * remPx).toBeGreaterThanOrEqual(44);
  });

  it("centers its content via inline-flex, rather than pinning a glyph to a corner of the now-larger box", () => {
    const style = document.createElement("button").style;
    style.cssText = inputButton("#fff", "#000");

    expect(style.display).toBe("inline-flex");
    expect(style.alignItems).toBe("center");
    expect(style.justifyContent).toBe("center");
  });

  it("still applies non-zero padding, unlike the pre-fix version", () => {
    const style = document.createElement("button").style;
    style.cssText = inputButton("#fff", "#000");

    expect(style.padding).not.toBe("");
    expect(style.padding).not.toBe("0px");
  });
});

// Sanity check that primaryButtonStyle (the text-button sibling, used for
// Save/Retry) was never the one missing padding - this fix is scoped to
// inputButton alone.
describe("primaryButtonStyle", () => {
  it("already applies padding (unaffected by the inputButton fix)", () => {
    const style = document.createElement("button").style;
    style.cssText = primaryButtonStyle("#fff", "#000");

    expect(style.padding).not.toBe("");
    expect(style.padding).not.toBe("0px");
  });
});
