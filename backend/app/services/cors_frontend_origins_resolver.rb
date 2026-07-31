# Turns the raw FRONTEND_ORIGINS env value (or its absence) into the actual
# origins list config/initializers/cors.rb's /graphql allow block uses,
# applying the fail-closed-in-production rule: an unset/blank
# FRONTEND_ORIGINS in production yields an empty allowlist (no /graphql
# origin is ever allowed), not the dev-only DEFAULT_FRONTEND_ORIGINS
# wildcard below - a forgotten env var in production previously fell
# through to an open *.trycloudflare.com wildcard.
#
# Extracted as a pure function (explicit `raw_value`/`production:` inputs,
# no direct ENV/Rails.env reads) so this is unit-testable without needing
# to reboot Rails with different environment state - see cors.rb's own
# comment for why a live request spec can't exercise a changed
# FRONTEND_ORIGINS value (it's read once at boot into a frozen Rack::Cors
# middleware instance).
module CorsFrontendOriginsResolver
  # Comma-separated fallback used only outside production. Includes the
  # Vite dev server origin plus a Cloudflare Quick Tunnel wildcard, so local
  # tunnel testing works without setting FRONTEND_ORIGINS by hand every
  # time the tunnel restarts (see README.md's "Testing the bookmarklet
  # against real AO3").
  DEFAULT_FRONTEND_ORIGINS = "http://localhost:5173,https://*.trycloudflare.com".freeze

  def self.call(raw_value, production:)
    return [] if production && raw_value.blank?

    effective_value = raw_value.presence || DEFAULT_FRONTEND_ORIGINS

    effective_value
      .split(",")
      .map(&:strip)
      .reject(&:blank?)
      .map { |origin| CorsFrontendOriginMatcher.call(origin) }
  end
end
