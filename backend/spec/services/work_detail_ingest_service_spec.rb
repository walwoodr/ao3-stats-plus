require "rails_helper"

# WorkDetailIngestService is the write path for one work's Phase 2
# enrichment POST (docs/plans/work-page-enrichment-data-model.md section 3):
# authorize by capability token, locate today's Snapshot, find-or-update the
# WorkStat for (today's snapshot, work) with the new time-series fields,
# update the Work's latest-state fields, and delete-and-replace that work's
# work_bookmarks - all in one transaction. See
# spec/support/work_detail_payloads.rb for the payload contract this stage
# is defining.
#
# Interface this spec pins down (Planning left the exact shape open):
#   WorkDetailIngestService.new(payload: <Hash>).call
#     => Result#ao3_user, #work, #work_stat
#   raises WorkDetailIngestService::TokenMismatch on a wrong/missing token,
#     or an unknown username (never distinguished from a wrong token, so a
#     probing client can't use this endpoint to enumerate usernames).
#   raises WorkDetailIngestService::InvalidPayload on malformed/missing
#     required fields.
#   raises WorkDetailIngestService::UnsupportedSchemaVersion on an
#     unsupported schemaVersion (own constant, independent of
#     SnapshotIngestService::CURRENT_SCHEMA_VERSION per the plan).
#   raises WorkDetailIngestService::NoSnapshotForToday - the defensive-only
#     guard (plan section 3): no Snapshot for the user today, no Work for
#     (user, ao3WorkId), or no existing WorkStat for (today's snapshot,
#     work) - all three collapse to the same "nowhere valid to attach this
#     enrichment" error, since the fan-out's handling is identical either
#     way (skip this work, tally it, continue).
RSpec.describe WorkDetailIngestService do
  # Phase 1 (SnapshotIngestService, unchanged) always runs before Phase 2 in
  # the real fan-out and is what creates the Snapshot + Work + base WorkStat
  # this service enriches - reused here rather than hand-building those rows,
  # so these specs exercise the same attach point Phase 2 really sees.
  def capture_phase_one!(username:, read_token: nil, ao3_work_id: 111)
    SnapshotIngestService.new(
      payload: valid_ingest_payload(
        username: username,
        read_token: read_token,
        works: [
          {
            "ao3WorkId" => ao3_work_id, "title" => "Work A", "fandoms" => [ "Fandom One" ],
            "hits" => 400, "kudos" => 40, "comments" => 8, "bookmarks" => 6,
            "subscriptions" => 4, "wordCount" => 30_000
          }
        ],
      ),
    ).call
  end

  describe "#call with a valid token" do
    it "returns a Result exposing ao3_user, work, and work_stat" do
      phase_one = capture_phase_one!(username: "worker_valid")

      result = described_class.new(
        payload: valid_work_detail_payload(username: "worker_valid", read_token: phase_one.read_token),
      ).call

      expect(result.ao3_user).to eq(phase_one.ao3_user)
      expect(result.work.ao3_work_id).to eq(111)
      expect(result.work_stat.snapshot).to eq(phase_one.snapshot)
    end
  end

  describe "#call token authorization (reuses the secure_compare pattern)" do
    it "raises TokenMismatch for a wrong token on a known username" do
      capture_phase_one!(username: "worker_wrong_token")

      expect {
        described_class.new(
          payload: valid_work_detail_payload(username: "worker_wrong_token", read_token: "not_the_token"),
        ).call
      }.to raise_error(WorkDetailIngestService::TokenMismatch)
    end

    # secure_compare is constant-time but not nil-safe - a payload missing
    # readToken entirely must still surface as an ordinary TokenMismatch,
    # not a 500-causing NoMethodError (mirrors SnapshotIngestService's
    # equivalent guard).
    it "raises TokenMismatch (not a NoMethodError) when readToken is missing from the payload" do
      capture_phase_one!(username: "worker_missing_token")

      expect {
        described_class.new(
          payload: valid_work_detail_payload(username: "worker_missing_token", read_token: nil),
        ).call
      }.to raise_error(WorkDetailIngestService::TokenMismatch)
    end

    it "raises TokenMismatch for an unknown username rather than a distinct not-found error" do
      expect {
        described_class.new(
          payload: valid_work_detail_payload(username: "no_such_worker", read_token: "anything"),
        ).call
      }.to raise_error(WorkDetailIngestService::TokenMismatch)
    end

    it "persists no changes when the token is wrong" do
      phase_one = capture_phase_one!(username: "worker_no_write_on_mismatch")

      expect {
        begin
          described_class.new(
            payload: valid_work_detail_payload(
              username: "worker_no_write_on_mismatch", read_token: "wrong",
            ),
          ).call
        rescue WorkDetailIngestService::TokenMismatch
          nil
        end
      }.not_to change { phase_one.snapshot.work_stats.first.reload.updated_at }
    end
  end

  describe "#call schema version" do
    it "raises UnsupportedSchemaVersion for an unsupported schemaVersion" do
      phase_one = capture_phase_one!(username: "worker_bad_schema")

      expect {
        described_class.new(
          payload: valid_work_detail_payload(
            username: "worker_bad_schema", read_token: phase_one.read_token, schema_version: 0,
          ),
        ).call
      }.to raise_error(WorkDetailIngestService::UnsupportedSchemaVersion)
    end
  end

  describe "#call with a malformed payload" do
    it "raises InvalidPayload when username is missing" do
      payload = valid_work_detail_payload.tap { |p| p.delete("username") }

      expect { described_class.new(payload: payload).call }.to raise_error(WorkDetailIngestService::InvalidPayload)
    end

    it "raises InvalidPayload when ao3WorkId is missing" do
      payload = valid_work_detail_payload.tap { |p| p.delete("ao3WorkId") }

      expect { described_class.new(payload: payload).call }.to raise_error(WorkDetailIngestService::InvalidPayload)
    end

    it "raises InvalidPayload when workStats is missing" do
      payload = valid_work_detail_payload.tap { |p| p.delete("workStats") }

      expect { described_class.new(payload: payload).call }.to raise_error(WorkDetailIngestService::InvalidPayload)
    end
  end

  describe "#call snapshot attachment (defensive NoSnapshotForToday guard, plan section 3)" do
    it "raises NoSnapshotForToday when the user has no snapshot for today at all" do
      phase_one = capture_phase_one!(username: "worker_no_today_snapshot")

      travel_to(1.day.from_now) do
        expect {
          described_class.new(
            payload: valid_work_detail_payload(
              username: "worker_no_today_snapshot", read_token: phase_one.read_token,
            ),
          ).call
        }.to raise_error(WorkDetailIngestService::NoSnapshotForToday)
      end
    end

    it "raises NoSnapshotForToday when no Work exists for this user/ao3WorkId" do
      phase_one = capture_phase_one!(username: "worker_no_such_work")

      expect {
        described_class.new(
          payload: valid_work_detail_payload(
            username: "worker_no_such_work", read_token: phase_one.read_token, ao3_work_id: 999_999,
          ),
        ).call
      }.to raise_error(WorkDetailIngestService::NoSnapshotForToday)
    end

    it "raises NoSnapshotForToday when the Work exists but has no WorkStat in today's snapshot (race)" do
      phase_one = capture_phase_one!(username: "worker_no_workstat_race")
      # Simulates the race the plan calls out: a work newly seen by AO3 but
      # not captured into today's snapshot's work_stats.
      orphan_work = phase_one.ao3_user.works.create!(
        ao3_work_id: 222, title: "Orphan Work", fandoms: "Fandom Two", last_seen_on: Date.current,
      )

      expect {
        described_class.new(
          payload: valid_work_detail_payload(
            username: "worker_no_workstat_race", read_token: phase_one.read_token,
            ao3_work_id: orphan_work.ao3_work_id,
          ),
        ).call
      }.to raise_error(WorkDetailIngestService::NoSnapshotForToday)
    end

    it "attaches the enrichment to a WorkStat whose snapshot.captured_on is today" do
      phase_one = capture_phase_one!(username: "worker_attach_today")

      result = described_class.new(
        payload: valid_work_detail_payload(username: "worker_attach_today", read_token: phase_one.read_token),
      ).call

      expect(result.work_stat.snapshot.captured_on).to eq(Date.current)
    end
  end

  describe "#call idempotent same-day re-run (updates in place, unlike /ingest's dedup-skip)" do
    it "does not create a second WorkStat row for the same (snapshot, work) on a same-day re-run" do
      phase_one = capture_phase_one!(username: "worker_idempotent")
      described_class.new(
        payload: valid_work_detail_payload(username: "worker_idempotent", read_token: phase_one.read_token),
      ).call

      expect {
        described_class.new(
          payload: valid_work_detail_payload(username: "worker_idempotent", read_token: phase_one.read_token),
        ).call
      }.not_to change(WorkStat, :count)
    end

    it "overwrites the WorkStat enrichment fields with the second call's values, not the first's" do
      phase_one = capture_phase_one!(username: "worker_idempotent_values")
      described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_idempotent_values", read_token: phase_one.read_token,
          work_stats: { "publicBookmarks" => 1, "visibleComments" => 2, "chapterCount" => 1, "chaptersExpected" => nil },
        ),
      ).call

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_idempotent_values", read_token: phase_one.read_token,
          work_stats: { "publicBookmarks" => 9, "visibleComments" => 20, "chapterCount" => 4, "chaptersExpected" => 4 },
        ),
      ).call

      expect(result.work_stat.reload).to have_attributes(
        public_bookmarks: 9, visible_comments: 20, chapter_count: 4, chapters_expected: 4,
      )
    end
  end

  describe "#call enriches the existing WorkStat without disturbing Phase 1's fields" do
    it "sets public_bookmarks/visible_comments/chapter_count/chapters_expected" do
      phase_one = capture_phase_one!(username: "worker_enrich_fields")

      result = described_class.new(
        payload: valid_work_detail_payload(username: "worker_enrich_fields", read_token: phase_one.read_token),
      ).call

      expect(result.work_stat.reload).to have_attributes(
        public_bookmarks: 6, visible_comments: 14, chapter_count: 3, chapters_expected: 12,
      )
    end

    it "leaves Phase 1's hits/kudos/comments/bookmarks/subscriptions/word_count untouched" do
      phase_one = capture_phase_one!(username: "worker_enrich_no_disturb")

      result = described_class.new(
        payload: valid_work_detail_payload(username: "worker_enrich_no_disturb", read_token: phase_one.read_token),
      ).call

      expect(result.work_stat.reload).to have_attributes(
        hits: 400, kudos: 40, comments: 8, bookmarks: 6, subscriptions: 4, word_count: 30_000,
      )
    end
  end

  describe "#call updates the Work's latest-state fields" do
    it "sets published_on, series (comma-joined), complete, and work_page_captured_at" do
      phase_one = capture_phase_one!(username: "worker_latest_state")

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_latest_state", read_token: phase_one.read_token,
          work: { "publishedOn" => "2023-05-01", "series" => [ "Series One", "Series Two" ], "complete" => true },
        ),
      ).call

      expect(result.work.reload).to have_attributes(
        published_on: Date.new(2023, 5, 1), series: "Series One, Series Two", complete: true,
      )
      expect(result.work.work_page_captured_at).to be_present
    end

    it "overwrites the latest-state fields on a later capture rather than preserving the first" do
      phase_one = capture_phase_one!(username: "worker_latest_state_overwrite")
      described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_latest_state_overwrite", read_token: phase_one.read_token,
          work: { "publishedOn" => "2023-05-01", "series" => [ "Series One" ], "complete" => false },
        ),
      ).call

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_latest_state_overwrite", read_token: phase_one.read_token,
          work: { "publishedOn" => "2023-05-01", "series" => [], "complete" => true },
        ),
      ).call

      expect(result.work.reload).to have_attributes(series: nil, complete: true)
    end
  end

  describe "#call delete-and-replace of work_bookmarks" do
    it "inserts one work_bookmark row per bookmark in the payload" do
      phase_one = capture_phase_one!(username: "worker_bookmarks_insert")

      result = described_class.new(
        payload: valid_work_detail_payload(username: "worker_bookmarks_insert", read_token: phase_one.read_token),
      ).call

      expect(result.work.work_bookmarks.count).to eq(2)
    end

    it "wholesale-replaces the prior list on a re-capture rather than accumulating history" do
      phase_one = capture_phase_one!(username: "worker_bookmarks_replace")
      described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_bookmarks_replace", read_token: phase_one.read_token,
          bookmarks: [ { "bookmarkerName" => "first_reader", "noteHtml" => nil, "bookmarkerTags" => [], "bookmarkedOn" => nil, "collections" => [] } ],
        ),
      ).call

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_bookmarks_replace", read_token: phase_one.read_token,
          bookmarks: [ { "bookmarkerName" => "second_reader", "noteHtml" => nil, "bookmarkerTags" => [], "bookmarkedOn" => nil, "collections" => [] } ],
        ),
      ).call

      names = result.work.work_bookmarks.pluck(:bookmarker_name)
      expect(names).to eq([ "second_reader" ])
    end

    it "tolerates a deleted/orphaned bookmarker (nil bookmarker_name) without dropping the row" do
      phase_one = capture_phase_one!(username: "worker_orphaned_bookmarker")

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_orphaned_bookmarker", read_token: phase_one.read_token,
          bookmarks: [ { "bookmarkerName" => nil, "noteHtml" => "<p>still here</p>", "bookmarkerTags" => [], "bookmarkedOn" => nil, "collections" => [] } ],
        ),
      ).call

      expect(result.work.work_bookmarks.count).to eq(1)
      expect(result.work.work_bookmarks.first.bookmarker_name).to be_nil
    end
  end

  describe "#call zero-public-bookmarks (0, not NULL, when genuinely captured-and-zero)" do
    it "persists public_bookmarks as 0 and an empty work_bookmarks list, not an error" do
      phase_one = capture_phase_one!(username: "worker_zero_bookmarks")

      result = described_class.new(
        payload: valid_work_detail_payload(
          username: "worker_zero_bookmarks", read_token: phase_one.read_token,
          work_stats: { "publicBookmarks" => 0, "visibleComments" => 0, "chapterCount" => 1, "chaptersExpected" => 1 },
          bookmarks: [],
        ),
      ).call

      expect(result.work_stat.reload.public_bookmarks).to eq(0)
      expect(result.work.work_bookmarks.count).to eq(0)
    end
  end

  describe "#call transactional integrity" do
    it "rolls back the whole transaction (WorkStat, Work, and work_bookmarks) on an invalid work_stats value" do
      phase_one = capture_phase_one!(username: "worker_rollback")
      original_published_on = phase_one.ao3_user.works.first.published_on

      expect {
        begin
          described_class.new(
            payload: valid_work_detail_payload(
              username: "worker_rollback", read_token: phase_one.read_token,
              work_stats: { "publicBookmarks" => -1, "visibleComments" => 0, "chapterCount" => 1, "chaptersExpected" => 1 },
              work: { "publishedOn" => "2023-05-01", "series" => [ "Series One" ], "complete" => true },
            ),
          ).call
        rescue StandardError
          nil
        end
      }.not_to change { phase_one.ao3_user.works.first.reload.published_on }
      expect(phase_one.ao3_user.works.first.reload.published_on).to eq(original_published_on)
      expect(phase_one.ao3_user.works.first.work_bookmarks.count).to eq(0)
    end
  end
end
