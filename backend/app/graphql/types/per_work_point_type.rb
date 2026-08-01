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

    # Work-page enrichment fields (docs/plans/work-page-enrichment-data-model.md
    # section 4) - all nullable: NULL means this snapshot's work page was
    # never scraped by Phase 2, never a fabricated zero.
    field :public_bookmarks, Integer, null: true
    field :visible_comments, Integer, null: true
    field :chapter_count, Integer, null: true
    field :chapters_expected, Integer, null: true
    field :private_bookmarks, Integer, null: true,
      description: "Derived: bookmarks - publicBookmarks, clamped >= 0. Null when publicBookmarks was never captured."

    def captured_on
      object.snapshot.captured_on
    end

    def private_bookmarks
      object.private_bookmarks
    end
  end
end
