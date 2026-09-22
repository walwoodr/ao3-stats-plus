# BookmarkNoteSanitizer applies defense-in-depth, at-rest sanitization to a
# scraped bookmark's noteHtml before WorkDetailIngestService persists it
# (TECH_DEBT.md, 2026-08-01: "note_html is stored verbatim... relying on
# AO3's sanitizer for our own render context is fragile"). This is a SECOND,
# independent sanitization boundary alongside frontend/src/lib/sanitizeHtml.ts
# (the primary render-time sanitizer) - not a replacement for it, since any
# future consumer of note_html besides the current feed UI should also
# inherit a safe value.
#
# Both boundaries apply the SAME philosophy (TECH_DEBT.md, 2026-09-22 item
# 4): a blocklist of genuine danger, not a narrow allowlist. Structural/
# semantic HTML (summary/details, blockquote, lists, headings, images, etc.)
# is preserved; known script-execution vectors (script/style/iframe/object/
# embed/applet/base tags, event-handler attributes, javascript:/data: URI
# schemes) and the interactive form-element family (form/input/button/
# textarea/select/option) are stripped.
#
# Built on Loofah/Nokogiri - already-bundled transitive dependencies of
# rails-html-sanitizer/actionview, not a new gem (see TECH_STACK.md). A
# custom Loofah::Scrubber is used instead of Rails::Html::SafeListSanitizer's
# own default allowlist, because that default (and Loofah's own broader
# built-in element allowlist) is itself allowlist-shaped and, notably,
# already PERMITS form/input/button/textarea/select/option - the same gap
# DOMPurify's stock default had on the frontend before this fix. The
# element-level blocklist below is this class's own; attribute-level
# scrubbing (event handlers, URI-scheme validation, CSS) reuses Loofah's
# already-audited Loofah::HTML5::Scrub.scrub_attributes rather than
# reimplementing that validation.
class BookmarkNoteSanitizer
  DANGEROUS_TAGS = %w[
    script style iframe object embed applet base noscript
    form input button textarea select option
  ].freeze

  class Scrubber < Loofah::Scrubber
    def initialize
      super(direction: :top_down)
    end

    def scrub(node)
      return Loofah::Scrubber::CONTINUE unless node.element?

      if DANGEROUS_TAGS.include?(node.name.downcase)
        node.remove
        return Loofah::Scrubber::STOP
      end

      Loofah::HTML5::Scrub.scrub_attributes(node)
      Loofah::Scrubber::CONTINUE
    end
  end

  def self.sanitize(html)
    return html if html.nil?

    Loofah.html5_fragment(html).scrub!(Scrubber.new).to_s
  end
end
