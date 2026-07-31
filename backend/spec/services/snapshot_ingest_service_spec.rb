require "rails_helper"

# SnapshotIngestService is the single write path for an ingested bookmarklet
# payload: find-or-create the Ao3User, mint/verify the capability token,
# dedup same-day snapshots, and transactionally persist snapshot + works +
# work_stats. See spec/support/ingest_payloads.rb for the payload contract
# this stage is defining.
#
# Interface this spec pins down (Planning left the exact shape open):
#   SnapshotIngestService.new(payload: <Hash>).call
#     => Result#ao3_user, #snapshot, #read_token, #deduped?
#   raises SnapshotIngestService::TokenMismatch on a wrong token for an
#     existing username, and SnapshotIngestService::InvalidPayload on
#     malformed/missing required fields.
RSpec.describe SnapshotIngestService do
  describe "#call with a brand-new username" do
    it "creates a new Ao3User" do
      expect {
        described_class.new(payload: valid_ingest_payload(username: "brandnewuser")).call
      }.to change(Ao3User, :count).by(1)
    end

    it "mints a fresh read_token and returns it on the result" do
      result = described_class.new(payload: valid_ingest_payload(username: "tokenmint")).call

      expect(result.read_token).to be_present
      expect(result.ao3_user.read_token).to eq(result.read_token)
    end

    it "ignores any client-supplied readToken when the user doesn't exist yet" do
      result = described_class.new(
        payload: valid_ingest_payload(username: "ignoretoken", read_token: "client_supplied"),
      ).call

      expect(result.ao3_user.read_token).not_to eq("client_supplied")
    end

    it "derives captured_on from server time, not any client-supplied date" do
      travel_to Time.zone.local(2026, 3, 15, 12, 0, 0) do
        result = described_class.new(payload: valid_ingest_payload(username: "servertime")).call
        expect(result.snapshot.captured_on).to eq(Date.new(2026, 3, 15))
      end
    end

    it "returns deduped: false" do
      result = described_class.new(payload: valid_ingest_payload(username: "notdeduped")).call
      expect(result.deduped?).to be(false)
    end

    it "persists the aggregate totals onto the snapshot" do
      result = described_class.new(payload: valid_ingest_payload(username: "aggtotals")).call

      expect(result.snapshot).to have_attributes(
        total_hits: 1_000,
        total_kudos: 100,
        total_comments: 20,
        total_bookmarks: 15,
        total_subscriptions: 10,
        total_user_subscriptions: 5,
        total_word_count: 75_000,
        works_count: 2,
      )
    end

    it "upserts a Work row per work in the payload" do
      expect {
        described_class.new(payload: valid_ingest_payload(username: "workupsert")).call
      }.to change(Work, :count).by(2)
    end

    it "inserts a WorkStat row per work, linked to the new snapshot" do
      result = described_class.new(payload: valid_ingest_payload(username: "workstatinsert")).call
      expect(result.snapshot.work_stats.count).to eq(2)
    end
  end

  describe "#call with an existing username and a matching token" do
    it "reuses the existing Ao3User rather than creating another one" do
      first = described_class.new(payload: valid_ingest_payload(username: "returning")).call
      token = first.read_token

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "returning", read_token: token),
        ).call
      }.not_to change(Ao3User, :count)
    end
  end

  describe "#call with an existing username and a mismatched token" do
    it "raises SnapshotIngestService::TokenMismatch" do
      described_class.new(payload: valid_ingest_payload(username: "protected")).call

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "protected", read_token: "wrong_token"),
        ).call
      }.to raise_error(SnapshotIngestService::TokenMismatch)
    end

    it "persists no new snapshot when the token is wrong" do
      described_class.new(payload: valid_ingest_payload(username: "protected2")).call

      expect {
        begin
          described_class.new(
            payload: valid_ingest_payload(username: "protected2", read_token: "wrong_token"),
          ).call
        rescue SnapshotIngestService::TokenMismatch
          nil
        end
      }.not_to change(Snapshot, :count)
    end

    # A payload missing "readToken" entirely (as opposed to one with a wrong
    # but present value, covered above) decodes to a nil client_read_token.
    # ActiveSupport::SecurityUtils.secure_compare is not nil-safe - it raises
    # NoMethodError on a nil argument rather than returning false - so this
    # must still surface as an ordinary TokenMismatch, not a 500.
    it "raises SnapshotIngestService::TokenMismatch (not a NoMethodError) when readToken is missing from the payload" do
      described_class.new(payload: valid_ingest_payload(username: "protected3")).call

      expect {
        described_class.new(payload: valid_ingest_payload(username: "protected3", read_token: nil)).call
      }.to raise_error(SnapshotIngestService::TokenMismatch)
    end
  end

  describe "#call dedup on (ao3_user, captured_on)" do
    it "does not create a second snapshot for the same user on the same server day" do
      first = described_class.new(payload: valid_ingest_payload(username: "sameday")).call
      token = first.read_token

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "sameday", read_token: token),
        ).call
      }.not_to change(Snapshot, :count)
    end

    it "returns deduped: true and the original snapshot on a same-day repeat" do
      first = described_class.new(payload: valid_ingest_payload(username: "sameday2")).call
      token = first.read_token

      second = described_class.new(
        payload: valid_ingest_payload(username: "sameday2", read_token: token),
      ).call

      expect(second.deduped?).to be(true)
      expect(second.snapshot.id).to eq(first.snapshot.id)
    end

    it "creates a new snapshot on a later day for the same user" do
      first = described_class.new(payload: valid_ingest_payload(username: "nextday")).call
      token = first.read_token

      travel_to(1.day.from_now) do
        expect {
          described_class.new(
            payload: valid_ingest_payload(username: "nextday", read_token: token),
          ).call
        }.to change(Snapshot, :count).by(1)
      end
    end
  end

  describe "#call with a malformed payload" do
    it "raises SnapshotIngestService::InvalidPayload when username is missing" do
      payload = valid_ingest_payload.tap { |p| p.delete("username") }

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(SnapshotIngestService::InvalidPayload)
    end

    it "raises SnapshotIngestService::InvalidPayload when aggregate is missing" do
      payload = valid_ingest_payload.tap { |p| p.delete("aggregate") }

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(SnapshotIngestService::InvalidPayload)
    end

    it "persists nothing when the payload is malformed" do
      payload = valid_ingest_payload(username: "malformeduser").tap { |p| p.delete("aggregate") }

      expect {
        begin
          described_class.new(payload: payload).call
        rescue SnapshotIngestService::InvalidPayload
          nil
        end
      }.not_to change(Ao3User, :count)
    end
  end

  # earliest_post_year is a supplementary, non-fatal fact captured
  # alongside a snapshot: the synthetic zero-point baseline year. It's
  # retried on every ingest until it's set (a scrape can come back empty on
  # any given capture - e.g. AO3's year-selector markup not matching - with
  # no guarantee the very first one succeeds), including a same-day dedup
  # ingest (a user retrying the bookmarklet the same day counts as a retry
  # too), but once set it's never overwritten by a later ingest, and a
  # malformed/out-of-range value must never cause the real ingest to
  # fail.
  describe "#call earliest_post_year handling" do
    it "persists earliest_post_year from the payload on a brand-new user's first ingest" do
      result = described_class.new(
        payload: valid_ingest_payload(username: "firstyear", earliest_post_year: 2014),
      ).call

      expect(result.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "leaves earliest_post_year nil when the payload omits it" do
      result = described_class.new(payload: valid_ingest_payload(username: "noyear")).call

      expect(result.ao3_user.reload.earliest_post_year).to be_nil
    end

    it "backfills earliest_post_year on a later ingest if the first ingest's scrape came back empty" do
      first = described_class.new(payload: valid_ingest_payload(username: "backfillyear")).call
      token = first.read_token

      travel_to(1.day.from_now) do
        described_class.new(
          payload: valid_ingest_payload(
            username: "backfillyear", read_token: token, earliest_post_year: 2014,
          ),
        ).call
      end

      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "does not overwrite an already-set earliest_post_year on a later ingest, even with a different value" do
      first = described_class.new(
        payload: valid_ingest_payload(username: "returningyear", earliest_post_year: 2014),
      ).call
      token = first.read_token

      travel_to(1.day.from_now) do
        described_class.new(
          payload: valid_ingest_payload(
            username: "returningyear", read_token: token, earliest_post_year: 1999,
          ),
        ).call
      end

      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "does not overwrite an already-set earliest_post_year on the same-day dedup path" do
      first = described_class.new(
        payload: valid_ingest_payload(username: "dedupyear", earliest_post_year: 2014),
      ).call
      token = first.read_token

      second = described_class.new(
        payload: valid_ingest_payload(
          username: "dedupyear", read_token: token, earliest_post_year: 2020,
        ),
      ).call

      expect(second.deduped?).to be(true)
      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    # The real-world case a same-day dedup previously dropped silently: a
    # user's first-ever capture scrapes no year (e.g. AO3's year-selector
    # markup wasn't there yet), then they retry the bookmarklet the same
    # day once the page/markup is right - a same-day retry is exactly the
    # kind of thing a user does when troubleshooting, so this path getting
    # it right matters as much as the next day's capture does.
    it "backfills earliest_post_year on a same-day dedup ingest if it was still nil" do
      first = described_class.new(payload: valid_ingest_payload(username: "dedupbackfill")).call
      token = first.read_token

      second = described_class.new(
        payload: valid_ingest_payload(
          username: "dedupbackfill", read_token: token, earliest_post_year: 2014,
        ),
      ).call

      expect(second.deduped?).to be(true)
      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "silently ignores an out-of-range (too old) earliest_post_year rather than raising" do
      payload = valid_ingest_payload(username: "tooold", earliest_post_year: 1800)

      result = nil
      expect { result = described_class.new(payload: payload).call }.not_to raise_error
      expect(result.ao3_user.reload.earliest_post_year).to be_nil
    end

    it "silently ignores an out-of-range (future) earliest_post_year rather than raising" do
      payload = valid_ingest_payload(username: "toofuture", earliest_post_year: Date.current.year + 5)

      result = nil
      expect { result = described_class.new(payload: payload).call }.not_to raise_error
      expect(result.ao3_user.reload.earliest_post_year).to be_nil
    end

    it "silently ignores a non-integer earliest_post_year rather than raising" do
      payload = valid_ingest_payload(username: "notanumber").tap { |p| p["earliestPostYear"] = "banana" }

      result = nil
      expect { result = described_class.new(payload: payload).call }.not_to raise_error
      expect(result.ao3_user.reload.earliest_post_year).to be_nil
    end
  end

  describe "transactional integrity" do
    it "rolls back the snapshot if a work_stats insert fails partway through" do
      bad_works = [
        { "ao3WorkId" => 333, "title" => "Bad Work", "fandoms" => [ "F" ], "hits" => -1,
          "kudos" => 0, "comments" => 0, "bookmarks" => 0, "subscriptions" => 0, "wordCount" => 0 }
      ]
      payload = valid_ingest_payload(username: "transactional", works: bad_works)

      expect {
        begin
          described_class.new(payload: payload).call
        rescue StandardError
          nil
        end
      }.not_to change(Snapshot, :count)
    end
  end
end
