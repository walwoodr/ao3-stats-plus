import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitizeHtml";

// sanitizeHtml is the SINGLE audited call site (docs/plans/bookmark-notes-
// feed.md §6, task T-02) through which every render of a bookmark's
// `noteHtml` must pass before reaching `dangerouslySetInnerHTML`. This is
// the load-bearing security test for the whole feature: `noteHtml` is raw,
// unsanitized, scraped AO3 HTML (backend's documented choice - see
// TECH_DEBT.md, 2026-08-01), so every malicious-payload case here MUST pass
// before BookmarkFeedItem renders a single real note.
//
// sanitizeHtml.ts does not exist yet (Testing precedes Implementation per
// this project's SDLC) - every test below is expected to fail on import
// alone until Implementation adds the module and the `dompurify` dependency
// (T-01).
describe("sanitizeHtml", () => {
  describe("null/empty input", () => {
    it("returns an empty string for null", () => {
      expect(sanitizeHtml(null)).toBe("");
    });

    it("returns an empty string for an empty string", () => {
      expect(sanitizeHtml("")).toBe("");
    });
  });

  describe("benign formatting is preserved", () => {
    it("preserves a <p> paragraph", () => {
      const result = sanitizeHtml("<p>Loved this fic!</p>");
      expect(result).toContain("<p>");
      expect(result).toContain("Loved this fic!");
    });

    it("preserves an <em> emphasis tag", () => {
      const result = sanitizeHtml("<p>This was <em>so</em> good.</p>");
      expect(result).toContain("<em>");
      expect(result).toContain("so");
    });

    it("preserves a plain <a> link's href", () => {
      const result = sanitizeHtml('<a href="https://example.com/fic">my other fic</a>');
      expect(result).toContain('href="https://example.com/fic"');
      expect(result).toContain("my other fic");
    });
  });

  describe("anchors get target=_blank rel=noopener noreferrer via the DOMPurify hook", () => {
    it("adds target and rel to a benign anchor", () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).toContain('target="_blank"');
      expect(result).toMatch(/rel="[^"]*noopener[^"]*"/);
      expect(result).toMatch(/rel="[^"]*noreferrer[^"]*"/);
    });
  });

  // The load-bearing test named explicitly in the plan (§6): a payload like
  // `<img src=x onerror=alert(1)>` and a `<script>` tag must be neutralized -
  // no `onerror`, no `<script>` - in the rendered output. Required, not
  // optional (plan's own wording).
  describe("malicious payloads are neutralized (T-02's required security test)", () => {
    it("strips a <script> tag entirely", () => {
      const result = sanitizeHtml('<p>hi</p><script>alert("xss")</script>');
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert(");
    });

    it("keeps the <img> element but drops the onerror handler", () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).toContain("<img");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("alert(1)");
    });

    it("strips a javascript: href from an anchor", () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
      expect(result).not.toContain("javascript:");
    });

    it("strips an onclick handler from a benign-looking element", () => {
      const result = sanitizeHtml('<p onclick="alert(1)">click me</p>');
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("alert(1)");
    });

    it("strips an <iframe>", () => {
      const result = sanitizeHtml('<iframe src="https://evil.example"></iframe>');
      expect(result).not.toContain("<iframe");
    });
  });

  describe("malformed HTML is tolerated, never throws (plan §5)", () => {
    it("returns well-formed output for unclosed tags rather than throwing", () => {
      expect(() => sanitizeHtml("<p>unclosed paragraph <em>and emphasis")).not.toThrow();
      const result = sanitizeHtml("<p>unclosed paragraph <em>and emphasis");
      expect(result).toContain("unclosed paragraph");
    });

    it("returns well-formed output for garbage/non-HTML text, never throws", () => {
      expect(() => sanitizeHtml("<<<not really html>>>")).not.toThrow();
    });
  });
});
