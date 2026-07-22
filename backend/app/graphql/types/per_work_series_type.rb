# frozen_string_literal: true

module Types
  # A single Work's identity plus its time series of WorkStat points,
  # ordered by captured_on ascending.
  class PerWorkSeriesType < Types::BaseObject
    field :ao3_work_id, Integer, null: false
    field :title, String, null: false
    field :fandoms, String, null: false
    field :points, [ Types::PerWorkPointType ], null: false

    def points
      object.work_stats.includes(:snapshot).joins(:snapshot).order("snapshots.captured_on ASC")
    end
  end
end
