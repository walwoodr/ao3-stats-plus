# Shared divide-by-zero-safe kudos-to-hits ratio calculation, used by both
# the top-level and per-point ratio fields in the statsForUser GraphQL
# response.
module StatsRatio
  def self.kudos_to_hits(kudos:, hits:)
    return 0.0 if hits.to_i.zero?

    kudos.to_f / hits
  end
end
