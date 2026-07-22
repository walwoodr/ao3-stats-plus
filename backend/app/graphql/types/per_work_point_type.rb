# frozen_string_literal: true

module Types
  # One point in a single work's time series - a WorkStat row from one
  # Snapshot.
  class PerWorkPointType < Types::BaseObject
    field :captured_on, GraphQL::Types::ISO8601Date, null: false
    field :hits, Integer, null: false
    field :kudos, Integer, null: false
    field :comments, Integer, null: false
    field :bookmarks, Integer, null: false
    field :subscriptions, Integer, null: false
    field :word_count, Integer, null: false

    def captured_on
      object.snapshot.captured_on
    end
  end
end
