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
export function inputButton(background: string, color: string): string {
  return (
    `background:${background};color:${color};border-radius:0.375rem;` +
    "font-size:1rem;font-weight:600;border:none;" +
    "cursor:pointer;font-family:inherit;align-self:center;" +
    "box-shadow:none;"
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
