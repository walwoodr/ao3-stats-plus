require "rails_helper"

# Unit coverage for the frontend-origin CORS matcher extracted from
# config/initializers/cors.rb (docs/plans/bookmarklet-entrypoint-and-hosting.md's
# finalized hosting plan, T2). CorsFrontendOriginMatcher is only ever used to
# build the /graphql allowlist from FRONTEND_ORIGINS - never /ingest's fixed
# AO3_ORIGINS allowlist (see spec/requests/ingest_spec.rb's own CORS
# coverage for that).
#
# This is pure extraction/scaffolding, not new behavior: the matcher's logic
# is unchanged from the inline lambda it replaced, so - unlike the rest of
# this Testing-stage batch - these examples pass immediately rather than
# being red. They exist so the /graphql origin-matching logic is
# independently testable at all, and to lock in its behavior against future
# changes.
RSpec.describe CorsFrontendOriginMatcher do
  describe ".call" do
    it "returns an exact production HTTPS origin unchanged, matching only that literal origin" do
      result = described_class.call("https://stats.example.com")

      expect(result).to eq("https://stats.example.com")
      expect(result).not_to be_a(Regexp)
    end

    it "turns a single-level wildcard origin into a Regexp that matches a real subdomain" do
      result = described_class.call("https://*.onrender.com")

      expect(result).to be_a(Regexp)
      expect(result).to match("https://ao3-stats-plus.onrender.com")
    end

    it "does not let the wildcard regexp match an unrelated origin" do
      result = described_class.call("https://*.onrender.com")

      expect(result).not_to match("https://evil.example.com")
    end

    it "does not let the wildcard regexp match a bare domain or a multi-level subdomain" do
      result = described_class.call("https://*.onrender.com")

      expect(result).not_to match("https://onrender.com")
      expect(result).not_to match("https://a.b.onrender.com")
    end

    it "never matches AO3's origin, even via a maximally broad single-level wildcard" do
      result = described_class.call("https://*")

      expect(result).to be_a(Regexp)
      expect(result).not_to match("https://archiveofourown.org")
      expect(result).not_to match("https://www.archiveofourown.org")
    end
  end
end
