# frozen_string_literal: true

module Types
  # One public bookmark's latest-known-state details on a work
  # (docs/plans/work-page-enrichment-data-model.md section 1c) - every field
  # except the owning work is nullable, tolerating a deleted/orphaned
  # bookmarker, a bookmark with no note, no tags, an unparseable date, or no
  # collections.
  class WorkBookmarkType < Types::BaseObject
    field :bookmarker_name, String, null: true
    field :note_html, String, null: true
    field :bookmarker_tags, String, null: true
    field :bookmarked_on, GraphQL::Types::ISO8601Date, null: true
    field :collections, String, null: true
  end
end
