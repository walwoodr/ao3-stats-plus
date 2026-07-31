# Turns a single "*" wildcard segment in a FRONTEND_ORIGINS entry into an
# anchored Regexp rack-cors can match against (see
# Rack::Cors::Resources#origins, which accepts Regexp alongside literal
# strings); origins without a "*" pass through unchanged. Extracted out of
# config/initializers/cors.rb - which previously held this as an inline
# lambda with no independent way to unit-test it - as pure test scaffolding
# (docs/plans/bookmarklet-entrypoint-and-hosting.md's finalized hosting
# plan, T2): behavior is unchanged from the original lambda, only its
# location and testability.
#
# Only ever used to build the /graphql frontend-origin allowlist from
# FRONTEND_ORIGINS - never /ingest's fixed AO3_ORIGINS allowlist (see
# cors.rb), so a wildcard configured here can never accidentally widen
# access to AO3's own origin.
module CorsFrontendOriginMatcher
  def self.call(origin)
    return origin unless origin.include?("*")

    pattern = Regexp.escape(origin).gsub('\*', "[^.]+")
    Regexp.new("\\A#{pattern}\\z")
  end
end
