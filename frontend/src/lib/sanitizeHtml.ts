import DOMPurify, { type Config } from "dompurify";

// Single audited call site for sanitizing bookmark `noteHtml` before it ever
// reaches `dangerouslySetInnerHTML` (docs/plans/bookmark-notes-feed.md §6).
// noteHtml is raw, unsanitized, scraped AO3 HTML by the backend's documented
// design (TECH_DEBT.md, 2026-08-01) - sanitization is exclusively the
// frontend's responsibility, and this is the one place it happens.
//
// Sanitization philosophy (TECH_DEBT.md 2026-09-22 item 4, superseding the
// prior implicit-default approach): this is a BLOCKLIST of genuine danger,
// not a narrow allowlist. AO3 bookmark notes are free-form rich prose, and
// the goal is to preserve as much of that prose's real structure as
// possible - semantic/structural tags like <summary>/<details> (AO3's
// common spoiler-collapsible convention), <blockquote>, lists, headings,
// etc. are intentionally left alone. What's blocked is (a) anything DOMPurify
// already treats as a script-execution vector by default - <script>, on*
// event-handler attributes, javascript:/data: URI schemes, <iframe>,
// <style>, SVG script vectors, mXSS-obfuscated markup - independently
// re-verified against 14 real XSS payload shapes (2026-09-14 Review) and
// left as DOMPurify's own default handling here, not reimplemented; and (b)
// the interactive form-element family (form/input/button/textarea/select),
// added explicitly via FORBID_TAGS below to close the phishing-form vector
// the same Review flagged (DOMPurify's stock default does NOT block these -
// a bookmarker could otherwise embed a fake login form in their note). Using
// an explicit FORBID_TAGS list (rather than relying on the implicit default
// already agreeing with this today) means this behavior can't silently
// regress on a future DOMPurify version bump. `option` is included alongside
// `select` since it has no meaning outside a select (forbidding the parent
// alone would otherwise leave its text content unwrapped and stray in the
// output).
const SANITIZE_CONFIG: Config = {
  FORBID_TAGS: ["form", "input", "button", "textarea", "select", "option"],
};

// DOMPurify hook: every anchor that survives sanitization gets forced to
// open in a new tab with `rel="noopener noreferrer"`, since note prose can
// contain arbitrary external links.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  // Deviation from the plan's literal "no `alt` will be invented" wording
  // (docs/plans/bookmark-notes-feed.md §6): that line is about not writing
  // FICTIONAL descriptive text (we genuinely can't know what a scraped
  // image depicts). An empty `alt=""` is different - it's the standard
  // WCAG-compliant way to mark an image as decorative/non-essential when no
  // real description is available, which is what actually satisfies axe's
  // mandatory image-alt rule (discovered via T-10's e2e a11y scan against a
  // real `<img>`-bearing note). Only applied when no alt is already
  // present, so an author-written alt is never overwritten.
  if (node.tagName === "IMG" && !node.hasAttribute("alt")) {
    node.setAttribute("alt", "");
  }
});

export function sanitizeHtml(html: string | null): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
