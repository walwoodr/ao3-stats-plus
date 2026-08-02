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
# real AO3").
#
# In production, FRONTEND_ORIGINS is set explicitly via render.yaml's
# ao3-stats-plus-api service (envVars: FRONTEND_ORIGINS, hardcoded to the
# deployed frontend's https://ao3-stats-plus.onrender.com origin - see
# render.yaml and README.md's "Deployment (Render)" section). If it's ever
# unset in production anyway (e.g. a misconfigured deploy), this fails
# closed to an empty allowlist rather than falling back to the dev-only
# wildcard default below - see CorsFrontendOriginsResolver.
#
# Wildcard-to-Regexp conversion (CorsFrontendOriginMatcher) and the
# fail-closed-in-production resolution (CorsFrontendOriginsResolver) both
# live under app/services so they're independently unit-testable - see
# spec/services/cors_frontend_origin_matcher_spec.rb and
# spec/services/cors_frontend_origins_resolver_spec.rb.
# require_relative'd explicitly rather than relied on via autoloading:
# this initializer's top-level code runs during the `load_config_initializers`
# step, which - in this Rails version - happens before `setup_main_autoloader`
# activates Zeitwerk's autoloader for app/**, so the bare constants aren't
# resolvable here yet.
require_relative "../../app/services/cors_frontend_origin_matcher"
require_relative "../../app/services/cors_frontend_origins_resolver"

frontend_origins = CorsFrontendOriginsResolver.call(ENV["FRONTEND_ORIGINS"], production: Rails.env.production?)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*AO3_ORIGINS)

    resource "/ingest",
      headers: :any,
      methods: %i[post options]

    # /ingest/work (Phase 2 per-work enrichment, plan section 3) is AO3-
    # bookmarklet-only exactly like /ingest - same trust boundary, so it's
    # scoped to the same AO3_ORIGINS allow block rather than the frontend one.
    resource "/ingest/work",
      headers: :any,
      methods: %i[post options]

    # /ingest/token (the "edit my token" action, memorable-token-and-recovery
    # plan section 3c) is likewise AO3-bookmarklet-only, not reachable from
    # our own frontend origin - the "Save token" action runs on the AO3 page,
    # not our dashboard.
    resource "/ingest/token",
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
