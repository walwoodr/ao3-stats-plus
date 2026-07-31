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

  # T3 (plan Section 7 task list) originally called for a full `/graphql`
  # CORS *request* spec asserting a production-style FRONTEND_ORIGINS value
  # is reflected in Access-Control-Allow-Origin. That's infeasible as a
  # request spec: config/initializers/cors.rb reads ENV["FRONTEND_ORIGINS"]
  # once, when the initializer runs at Rails boot, building a frozen
  # Rack::Cors middleware instance from it - not per request. Setting
  # ENV["FRONTEND_ORIGINS"] inside a running spec process has no effect on
  # that already-built middleware, so a spec that did this would silently
  # pass or fail against the *old* boot-time value, not the one it claims to
  # set - exactly the kind of test that can't exercise what it claims.
  #
  # Equivalent coverage is folded in here instead: this exercises the exact
  # origin-matching logic cors.rb's /graphql allow block builds from
  # FRONTEND_ORIGINS, just without going through a live request. The
  # existing /graphql request specs in
  # spec/requests/graphql/stats_for_user_spec.rb's "CORS" describe block
  # already prove end-to-end that whatever CorsFrontendOriginMatcher
  # produces really does get reflected in Access-Control-Allow-Origin (using
  # the boot-time default FRONTEND_ORIGINS) - together, these two spec files
  # cover the full path from FRONTEND_ORIGINS to the response header.
  describe "a representative production-style FRONTEND_ORIGINS entry (T3 coverage folded in)" do
    it "allows the exact configured production origin, unchanged, for rack-cors to match literally" do
      result = described_class.call("https://ao3-stats-plus.onrender.com")

      expect(result).to eq("https://ao3-stats-plus.onrender.com")
      expect(result).not_to be_a(Regexp)
    end

    it "never equals a different, unrelated origin under the same production-style configuration" do
      result = described_class.call("https://ao3-stats-plus.onrender.com")

      expect(result).not_to eq("https://evil.example.com")
    end
  end
end
