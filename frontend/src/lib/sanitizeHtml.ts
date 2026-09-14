import DOMPurify from "dompurify";

// Single audited call site for sanitizing bookmark `noteHtml` before it ever
// reaches `dangerouslySetInnerHTML` (docs/plans/bookmark-notes-feed.md §6).
// noteHtml is raw, unsanitized, scraped AO3 HTML by the backend's documented
// design (TECH_DEBT.md, 2026-08-01) - sanitization is exclusively the
// frontend's responsibility, and this is the one place it happens.

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
  return DOMPurify.sanitize(html);
}
