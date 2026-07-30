# Be sure to restart your server when you modify this file.
#
# Avoid CORS issues when API is called from cross-origin JavaScript.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin
# Ajax requests.
#
# Read more: https://github.com/cyu/rack-cors
#
# CORS is scoped per-endpoint, not globally, because /ingest and /graphql
# have very different trust boundaries:
#   - /ingest is called by the bookmarklet running on an AO3 page, so it
#     must accept the AO3 origin(s) - and only those.
#   - /graphql is called by our own frontend, so it must accept our
#     frontend origin(s) - and never AO3's, since that would let an
#     AO3-origin script run arbitrary GraphQL against us.
#
# Active in every environment (including test and production), not just
# development - AO3 itself needs to reach /ingest in production, and the
# CORS request specs exercise this behavior in test.

AO3_ORIGINS = [
  "https://archiveofourown.org",
  "https://www.archiveofourown.org"
].freeze

# Comma-separated list of allowed frontend origins for /graphql, e.g.
# "https://stats.example.com,https://www.stats.example.com". A "*" segment
# in an origin is treated as a single-level subdomain wildcard rather than a
# literal character - e.g. "https://*.trycloudflare.com" matches any
# Cloudflare Quick Tunnel origin, since those subdomains are randomly
# generated on every tunnel restart (see vite.config.ts's matching
# allowedHosts wildcard and README.md's "Testing the bookmarklet against
# real AO3"). Falls back to the Vite dev server origin plus that same
# wildcard, so local tunnel testing works without setting FRONTEND_ORIGINS
# by hand every time the tunnel restarts.
# TODO(deployment): set FRONTEND_ORIGINS explicitly once the deployed
# frontend origin is decided - the fallback below is a local-dev
# placeholder (an open subdomain wildcard), not a production-ready default.
DEFAULT_FRONTEND_ORIGINS = "http://localhost:5173,https://*.trycloudflare.com".freeze

# Turns a single "*" wildcard segment into a Regexp rack-cors can match
# against (see Rack::Cors::Resources#origins, which accepts Regexp
# alongside literal strings); origins without a "*" pass through unchanged.
frontend_origin_matcher = lambda do |origin|
  next origin unless origin.include?("*")

  pattern = Regexp.escape(origin).gsub('\*', "[^.]+")
  Regexp.new("\\A#{pattern}\\z")
end

frontend_origins = ENV.fetch("FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS)
  .split(",")
  .map(&:strip)
  .reject(&:blank?)
  .map(&frontend_origin_matcher)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*AO3_ORIGINS)

    resource "/ingest",
      headers: :any,
      methods: %i[post options]
  end

  allow do
    origins(*frontend_origins)

    resource "/graphql",
      headers: :any,
      methods: %i[post options]
  end
end
