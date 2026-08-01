# frozen_string_literal: true

module Types
  # A single Work's identity plus its time series of WorkStat points,
  # ordered by captured_on ascending.
  class PerWorkSeriesType < Types::BaseObject
    field :ao3_work_id, Integer, null: false
    field :title, String, null: false
    field :fandoms, String, null: false
    field :points, [ Types::PerWorkPointType ], null: false

    # Work-page enrichment latest-state identity fields (plan section 4) -
    # nullable, NULL until Phase 2 has ever captured this work's page.
    field :published_on, GraphQL::Types::ISO8601Date, null: true
    field :series, String, null: true
    field :complete, Boolean, null: true
    field :bookmarks, [ Types::WorkBookmarkType ], null: false

    def points
      object.work_stats.includes(:snapshot).joins(:snapshot).order("snapshots.captured_on ASC")
    end

    def bookmarks
      object.work_bookmarks
    end
  end
end
