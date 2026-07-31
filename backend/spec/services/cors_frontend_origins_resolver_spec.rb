require "rails_helper"

# Unit coverage for the FRONTEND_ORIGINS-to-origins-list resolution logic
# extracted from config/initializers/cors.rb, specifically the
# fail-closed-in-production rule: an unset/blank FRONTEND_ORIGINS in
# production must yield an empty allowlist (no /graphql origin is ever
# allowed), not the dev-only DEFAULT_FRONTEND_ORIGINS wildcard - a
# forgotten env var in production previously fell through to an open
# *.trycloudflare.com wildcard (see TECH_DEBT.md's now-resolved entry).
#
# Extracted as a pure function (explicit `raw_value`/`production:` inputs,
# no direct ENV/Rails.env reads) rather than tested via a live request spec
# - see CorsFrontendOriginMatcherSpec's own comment on why cors.rb's
# boot-time-only ENV read makes that infeasible; the same limitation
# applies here.
RSpec.describe CorsFrontendOriginsResolver do
  describe ".call" do
    it "fails closed (empty list) when FRONTEND_ORIGINS is unset in production" do
      result = described_class.call(nil, production: true)

      expect(result).to eq([])
    end

    it "fails closed (empty list) when FRONTEND_ORIGINS is blank in production" do
      result = described_class.call("", production: true)

      expect(result).to eq([])
    end

    it "uses the explicit FRONTEND_ORIGINS value in production when it is set" do
      result = described_class.call("https://ao3-stats-plus.onrender.com", production: true)

      expect(result).to eq([ "https://ao3-stats-plus.onrender.com" ])
    end

    it "falls back to the dev-only default (not an empty list) when unset outside production" do
      result = described_class.call(nil, production: false)

      expect(result).not_to be_empty
      expect(result.any? { |origin| origin == "http://localhost:5173" }).to be(true)
    end

    it "uses the explicit FRONTEND_ORIGINS value outside production when it is set" do
      result = described_class.call("https://stats.example.com", production: false)

      expect(result).to eq([ "https://stats.example.com" ])
    end

    it "splits a comma-separated FRONTEND_ORIGINS value into multiple entries" do
      result = described_class.call("https://a.example.com,https://b.example.com", production: true)

      expect(result).to eq([ "https://a.example.com", "https://b.example.com" ])
    end

    it "converts a wildcard entry the same way CorsFrontendOriginMatcher does" do
      result = described_class.call("https://*.onrender.com", production: true)

      expect(result.first).to be_a(Regexp)
      expect(result.first).to match("https://ao3-stats-plus.onrender.com")
    end
  end
end
