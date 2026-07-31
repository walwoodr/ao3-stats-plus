# WorkDetailIngestService is the write path for one work's Phase 2
# enrichment POST (docs/plans/work-page-enrichment-data-model.md section 3):
# authorize by capability token, locate today's Snapshot + the existing
# WorkStat for (today's snapshot, work), update its enrichment columns in
# place, update the Work's latest-state fields, and delete-and-replace that
# work's work_bookmarks - all in one transaction.
#
# Snapshot ordering is defensive-only (plan section 3): under the fan-out,
# Phase 1 always creates today's Snapshot + base WorkStat before Phase 2
# runs, so the normal path always finds them. NoSnapshotForToday covers the
# three ways that guarantee can fail (no Snapshot, no Work, no WorkStat) -
# they all collapse to the same error since the fan-out handles them
# identically (skip this work, tally it, continue).
class WorkDetailIngestService
  class InvalidPayload < StandardError; end
  class TokenMismatch < StandardError; end
  class UnsupportedSchemaVersion < StandardError; end
  class NoSnapshotForToday < StandardError; end

  CURRENT_SCHEMA_VERSION = 1

  Result = Struct.new(:ao3_user, :work, :work_stat, keyword_init: true)

  def initialize(payload:)
    @payload = payload
  end

  def call
    validate_payload!
    ao3_user = authorize!
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

  def client_read_token
    payload["readToken"]
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

  # No username-enumeration signal: an unknown username and a wrong token
  # for a known username both raise the same TokenMismatch.
  def authorize!
    ao3_user = Ao3User.find_by(username: username)
    raise TokenMismatch, "token mismatch for #{username}" unless ao3_user

    # secure_compare is constant-time but not nil-safe; client_read_token
    # can genuinely be nil for a malformed payload missing "readToken".
    unless ActiveSupport::SecurityUtils.secure_compare(ao3_user.read_token, client_read_token.to_s)
      raise TokenMismatch, "token mismatch for #{username}"
    end

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
        note_html: bookmark_data["noteHtml"],
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
