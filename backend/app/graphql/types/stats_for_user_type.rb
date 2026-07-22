# frozen_string_literal: true

module Types
  # Top-level payload for the statsForUser query: the author's current
  # (latest-snapshot) kudos-to-hits ratio, their full aggregate series, and
  # their per-work series - everything the dashboard needs in one round trip.
  class StatsForUserType < Types::BaseObject
    field :kudos_to_hits_ratio, Float, null: false
    field :aggregate_series, [ Types::AggregateSeriesPointType ], null: false
    field :per_work_series, [ Types::PerWorkSeriesType ], null: false
  end
end
