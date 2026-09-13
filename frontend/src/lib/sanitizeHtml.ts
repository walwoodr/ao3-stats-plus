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
});

export function sanitizeHtml(html: string | null): string {
  if (!html) return "";
  return DOMPurify.sanitize(html);
}
