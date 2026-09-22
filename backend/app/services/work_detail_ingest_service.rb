# WorkDetailIngestService is the write path for one work's Phase 2
# enrichment POST (docs/plans/work-page-enrichment-data-model.md section 3):
# locate the Ao3User by username, locate today's Snapshot + the existing
# WorkStat for (today's snapshot, work), update its enrichment columns in
# place, update the Work's latest-state fields, and delete-and-replace that
# work's work_bookmarks - all in one transaction.
#
# Per docs/plans/memorable-token-and-recovery.md section 3b: no token check
# here at all - /ingest/work is part of the same already-proved page-load
# fan-out as /ingest, and a token match requirement would break the
# edit-during-fan-out race (in-flight calls still carrying the *old* token
# while the user edits it mid-run). Any readToken in the payload is ignored.
#
# Snapshot ordering is defensive-only (plan section 3): under the fan-out,
# Phase 1 always creates today's Snapshot + base WorkStat before Phase 2
# runs, so the normal path always finds them. NoSnapshotForToday covers the
# four ways that guarantee can fail (no Ao3User, no Snapshot, no Work, no
# WorkStat) - they all collapse to the same error since the fan-out handles
# them identically (skip this work, tally it, continue).
#
# Per TECH_DEBT.md (2026-08-01, closed 2026-09-21 stage: Maintenance):
# bookmark noteHtml is sanitized here at ingest (BookmarkNoteSanitizer)
# before being persisted, as a second, independent boundary alongside the
# frontend's own render-time sanitization (frontend/src/lib/sanitizeHtml.ts)
# - not a replacement for it, since a render-time sanitizer is still
# mandatory defense against any future bug in either boundary, but this
# closes the "any future consumer... inherits a safe value" gap the
# TECH_DEBT entry flagged.
class WorkDetailIngestService
  class InvalidPayload < StandardError; end
  class UnsupportedSchemaVersion < StandardError; end
  class NoSnapshotForToday < StandardError; end

  CURRENT_SCHEMA_VERSION = 1

  Result = Struct.new(:ao3_user, :work, :work_stat, keyword_init: true)

  def initialize(payload:)
    @payload = payload
  end

  def call
    validate_payload!
    ao3_user = find_user!
    work_stat = locate_todays_work_stat!(ao3_user)

    ActiveRecord::Base.transaction do
      update_work_stat!(work_stat)
      update_work!(work_stat.work)
      replace_work_bookmarks!(work_stat.work)
    end

    Result.new(ao3_user: ao3_user, work: work_stat.work, work_stat: work_stat)
  end

  private

  attr_reader :payload

  def validate_payload!
    raise InvalidPayload, "username is required" if username.blank?
    raise InvalidPayload, "ao3WorkId is required" if ao3_work_id.blank?
    raise InvalidPayload, "workStats is required" unless payload["workStats"].is_a?(Hash)
    raise UnsupportedSchemaVersion, "unsupported schemaVersion" unless payload["schemaVersion"] == CURRENT_SCHEMA_VERSION
  end

  def username
    payload["username"]
  end

  def ao3_work_id
    payload["ao3WorkId"]
  end

  def work_stats_payload
    payload["workStats"]
  end

  def work_payload
    payload.fetch("work", {})
  end

  def bookmarks_payload
    payload.fetch("bookmarks", [])
  end

  # Unknown username -> NoSnapshotForToday: there is no token check left to
  # distinguish "unknown username" from "known username, nothing to attach
  # to today" - both mean there's nowhere valid to attach this enrichment.
  def find_user!
    ao3_user = Ao3User.find_by(username: username)
    raise NoSnapshotForToday, "no user for username #{username}" unless ao3_user

    ao3_user
  end

  def locate_todays_work_stat!(ao3_user)
    snapshot = ao3_user.snapshots.find_by(captured_on: Time.current.to_date)
    raise NoSnapshotForToday, "no snapshot for today" unless snapshot

    work = ao3_user.works.find_by(ao3_work_id: ao3_work_id)
    raise NoSnapshotForToday, "no work for ao3WorkId #{ao3_work_id}" unless work

    work_stat = WorkStat.find_by(snapshot: snapshot, work: work)
    raise NoSnapshotForToday, "no work_stat for today's snapshot" unless work_stat

    work_stat
  end

  def update_work_stat!(work_stat)
    work_stat.update!(
      public_bookmarks: work_stats_payload["publicBookmarks"],
      visible_comments: work_stats_payload["visibleComments"],
      chapter_count: work_stats_payload["chapterCount"],
      chapters_expected: work_stats_payload["chaptersExpected"],
    )
  end

  def update_work!(work)
    work.update!(
      published_on: parse_date(work_payload["publishedOn"]),
      series: Array(work_payload["series"]).join(", ").presence,
      complete: work_payload["complete"],
      work_page_captured_at: Time.current,
    )
  end

  def replace_work_bookmarks!(work)
    work.work_bookmarks.delete_all

    bookmarks_payload.each do |bookmark_data|
      work.work_bookmarks.create!(
        bookmarker_name: bookmark_data["bookmarkerName"],
        note_html: BookmarkNoteSanitizer.sanitize(bookmark_data["noteHtml"]),
        bookmarker_tags: Array(bookmark_data["bookmarkerTags"]).join(", ").presence,
        bookmarked_on: parse_date(bookmark_data["bookmarkedOn"]),
        collections: Array(bookmark_data["collections"]).join(", ").presence,
      )
    end
  end

  def parse_date(value)
    return nil if value.blank?

    Date.parse(value)
  rescue ArgumentError, TypeError
    nil
  end
end
