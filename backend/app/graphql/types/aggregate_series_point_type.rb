# frozen_string_literal: true

module Types
  # One point in an Ao3User's aggregate (account-wide) time series - a single
  # Snapshot's totals, plus a derived per-point kudos-to-hits ratio.
  class AggregateSeriesPointType < Types::BaseObject
    field :captured_on, GraphQL::Types::ISO8601Date, null: false
    field :total_hits, Integer, null: false
    field :total_kudos, Integer, null: false
    field :total_comments, Integer, null: false
    field :total_bookmarks, Integer, null: false
    field :total_subscriptions, Integer, null: false
    field :total_user_subscriptions, Integer, null: false
    field :total_word_count, Integer, null: false
    field :works_count, Integer, null: false
    field :kudos_to_hits_ratio, Float, null: false

    def kudos_to_hits_ratio
      StatsRatio.kudos_to_hits(kudos: object.total_kudos, hits: object.total_hits)
    end
  end
end
