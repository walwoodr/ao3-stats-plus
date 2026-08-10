// Small set of inline-style helpers shared between banners.ts and
// successBannerTokenField.ts. Pulled out into their own module (rather than
// exported from banners.ts directly) so the two files can each import from
// here without a circular dependency between them - banners.ts renders the
// outer banner shell and delegates the editable-token field to
// successBannerTokenField.ts, which needs some of the same button/text
// styling banners.ts's other renderXBanner functions use.

// Zeroes out the default <p> margin, since spacing between elements is
// handled by the parent's flex `gap` instead - otherwise the two stack.
export const MESSAGE_STYLE = "margin:0;";

export function primaryButtonStyle(background: string, color: string): string {
  return (
    `background:${background};color:${color};border:1px solid ${color};border-radius:0.375rem;` +
    "padding:0.5rem 0.9rem;font-size:0.875rem;font-weight:600;line-height:1.25;" +
    "cursor:pointer;font-family:inherit;align-self:center;" +
    "box-shadow:none;"
  );
}
// Unlike primaryButtonStyle, this backs an icon-glyph-only button (the
// token field's Copy button - see successBannerTokenField.ts) with no text
// label to pad out its own hit target, so it needs its own explicit
// touch-target sizing rather than relying on padding shaped for a text
// button. min-width/min-height (not padding alone) guarantee a >=44x44 CSS
// px target - the common WCAG/mobile touch-target minimum - regardless of
// the glyph's own rendered metrics; inline-flex centering keeps the glyph
// centered within that box rather than pinned to a corner (TECH_DEBT.md,
// 2026-07-23 "inputButton helper omits any padding").
export function inputButton(background: string, color: string): string {
  return (
    `background:${background};color:${color};border-radius:0.375rem;` +
    "font-size:1rem;font-weight:600;border:none;" +
    "cursor:pointer;font-family:inherit;align-self:center;" +
    "box-shadow:none;" +
    "padding:0.625rem;min-width:2.75rem;min-height:2.75rem;" +
    "display:inline-flex;align-items:center;justify-content:center;"
  );
}

// Styled as an outlined "secondary CTA" button rather than a bare
// underlined link, so it reads as obviously clickable next to the Copy
// button rather than blending into surrounding text.
export function ctaLinkStyle(accent: string, background: string): string {
  return (
    `display:inline-block;align-self:flex-start;color:${accent};background:${background};` +
    `border:1px solid ${accent};border-radius:0.375rem;padding:0.5rem 0.9rem;` +
    "font-size:0.875rem;font-weight:600;text-decoration:none;"
  );
}
