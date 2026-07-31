# WorkBookmark is one public bookmark's latest-known-state details on a
# Work (docs/plans/work-page-enrichment-data-model.md section 1c) - replaced
# wholesale (delete_all + bulk insert) on each work-bookmarks capture, never
# accumulated as history. Every scraped field except the owning work is
# nullable: AO3 tolerates a deleted/orphaned bookmarker, a bookmark with no
# note, no tags, an unparseable date, and no collections.
class WorkBookmark < ApplicationRecord
  belongs_to :work
end
