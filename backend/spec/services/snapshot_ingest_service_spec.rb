require "rails_helper"

# SnapshotIngestService is the single write path for an ingested bookmarklet
# payload: find-or-create the Ao3User, always accept-and-(re)set the
# client-supplied read_token (no server minting/verification - a browser
# successfully scraping real AO3 stats for username X is itself proof it is
# authenticated as X, per docs/plans/memorable-token-and-recovery.md's
# "why this is sound"), dedup same-day snapshots, and transactionally
# persist snapshot + works + work_stats. See spec/support/ingest_payloads.rb
# for the payload contract this stage is defining.
#
# Interface this spec pins down (plan section 3a):
#   SnapshotIngestService.new(payload: <Hash>).call
#     => Result#ao3_user, #snapshot, #read_token, #deduped?
#   raises SnapshotIngestService::InvalidPayload on malformed/missing
#     required fields, including a missing/blank readToken.
#   raises SnapshotIngestService::UnsupportedSchemaVersion on an
#     unsupported schemaVersion.
#   generate_token and SnapshotIngestService::TokenMismatch no longer exist -
#     always-accept has no branch between "mint" and "accept-and-reset".
RSpec.describe SnapshotIngestService do
  describe "#call with a brand-new username" do
    it "creates a new Ao3User" do
      expect {
        described_class.new(payload: valid_ingest_payload(username: "brandnewuser")).call
      }.to change(Ao3User, :count).by(1)
    end

    it "stores the client-supplied readToken verbatim (no server minting)" do
      result = described_class.new(
        payload: valid_ingest_payload(username: "clienttoken", read_token: "cat-dog"),
      ).call

      expect(result.read_token).to eq("cat-dog")
      expect(result.ao3_user.read_token).to eq("cat-dog")
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

  # Two concurrent first-ingests for the same brand-new username race on the
  # ao3_users.username unique index: this request's find_by (inside
  # find_or_create_user!) runs before the concurrent "winner" request has
  # committed, so it sees no row and attempts Ao3User.create!, which then
  # collides with the now-committed winner row and raises
  # ActiveRecord::RecordNotUnique. transactional fixtures make a real second
  # DB connection infeasible here, so the race is simulated directly: the
  # winner row is persisted for real, but find_by is stubbed to return nil on
  # its first call (this request's own pre-collision lookup) and the real
  # winner row on the retry after rescuing RecordNotUnique. Unchanged in
  # intent from before this plan - it's still a *username* race, not a
  # read_token one.
  describe "#call when a concurrent first-ingest already created the username" do
    def simulate_race_with(winner)
      allow(Ao3User).to receive(:find_by).with(username: winner.username).and_return(nil, winner)
      allow(Ao3User).to receive(:create!).and_raise(
        ActiveRecord::RecordNotUnique.new("duplicate key value violates unique constraint"),
      )
    end

    it "does not raise ActiveRecord::RecordNotUnique" do
      winner = Ao3User.create!(username: "raceduser", read_token: "winner_token")
      simulate_race_with(winner)

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "raceduser", read_token: "retry_token"),
        ).call
      }.not_to raise_error
    end

    it "treats the retry as the existing user once it re-finds the winner row" do
      winner = Ao3User.create!(username: "raceduser2", read_token: "winner_token")
      simulate_race_with(winner)

      result = described_class.new(
        payload: valid_ingest_payload(username: "raceduser2", read_token: "retry_token"),
      ).call

      expect(result.ao3_user).to eq(winner)
    end

    # Always-accept means the retry's own (different) token still wins - no
    # TokenMismatch branch exists any more to reject it.
    it "resets the winner's read_token to the retry's client-supplied token rather than raising" do
      winner = Ao3User.create!(username: "raceduser3", read_token: "winner_token")
      simulate_race_with(winner)

      result = described_class.new(
        payload: valid_ingest_payload(username: "raceduser3", read_token: "retry_token"),
      ).call

      expect(result.read_token).to eq("retry_token")
      expect(winner.reload.read_token).to eq("retry_token")
    end
  end

  describe "#call with an existing username and the same client token" do
    it "reuses the existing Ao3User rather than creating another one" do
      first = described_class.new(payload: valid_ingest_payload(username: "returning", read_token: "tok_a")).call

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "returning", read_token: first.read_token),
        ).call
      }.not_to change(Ao3User, :count)
    end
  end

  # The core behavior change (plan section 3a/decision 2): a different
  # client-supplied token for an existing username no longer raises
  # TokenMismatch - it succeeds and (re)sets read_token to the new value.
  # This is what makes recovery from a lost token possible: re-running the
  # bookmarklet on your own (real, logged-in) stats page always re-
  # establishes access.
  describe "#call with an existing username and a different client token (always-accept-and-reset)" do
    it "succeeds rather than raising" do
      described_class.new(payload: valid_ingest_payload(username: "protected", read_token: "original_token")).call

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "protected", read_token: "new_token"),
        ).call
      }.not_to raise_error
    end

    it "resets read_token to the new client-supplied value" do
      described_class.new(payload: valid_ingest_payload(username: "protected2", read_token: "original_token")).call

      result = described_class.new(
        payload: valid_ingest_payload(username: "protected2", read_token: "new_token"),
      ).call

      expect(result.read_token).to eq("new_token")
      expect(result.ao3_user.reload.read_token).to eq("new_token")
    end

    it "does not create a second Ao3User row" do
      described_class.new(payload: valid_ingest_payload(username: "protected3", read_token: "original_token")).call

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "protected3", read_token: "new_token"),
        ).call
      }.not_to change(Ao3User, :count)
    end

    it "still persists a new snapshot (today's ingest is not rejected)" do
      described_class.new(payload: valid_ingest_payload(username: "protected4", read_token: "original_token")).call

      travel_to(1.day.from_now) do
        expect {
          described_class.new(
            payload: valid_ingest_payload(username: "protected4", read_token: "new_token"),
          ).call
        }.to change(Snapshot, :count).by(1)
      end
    end
  end

  describe "#call with a missing or blank readToken" do
    it "raises InvalidPayload when readToken is missing from the payload entirely (nil)" do
      payload = valid_ingest_payload(username: "missingtoken", read_token: nil)

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(SnapshotIngestService::InvalidPayload)
    end

    it "raises InvalidPayload when readToken is an empty string" do
      payload = valid_ingest_payload(username: "blanktoken", read_token: "")

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(SnapshotIngestService::InvalidPayload)
    end

    it "raises InvalidPayload when readToken is only whitespace" do
      payload = valid_ingest_payload(username: "whitespacetoken", read_token: "   ")

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(SnapshotIngestService::InvalidPayload)
    end

    it "persists no user and no snapshot when readToken is missing" do
      payload = valid_ingest_payload(username: "notokenpersist", read_token: nil)

      expect {
        begin
          described_class.new(payload: payload).call
        rescue SnapshotIngestService::InvalidPayload
          nil
        end
      }.not_to change(Ao3User, :count)
    end
  end

  describe "#call dedup on (ao3_user, captured_on)" do
    it "does not create a second snapshot for the same user on the same server day" do
      first = described_class.new(payload: valid_ingest_payload(username: "sameday", read_token: "tok")).call

      expect {
        described_class.new(
          payload: valid_ingest_payload(username: "sameday", read_token: first.read_token),
        ).call
      }.not_to change(Snapshot, :count)
    end

    it "returns deduped: true and the original snapshot on a same-day repeat with the same token" do
      first = described_class.new(payload: valid_ingest_payload(username: "sameday2", read_token: "tok")).call

      second = described_class.new(
        payload: valid_ingest_payload(username: "sameday2", read_token: first.read_token),
      ).call

      expect(second.deduped?).to be(true)
      expect(second.snapshot.id).to eq(first.snapshot.id)
    end

    # Same-day dedup still runs the always-(re)set step first (plan section
    # 3a: "the token is set in the find-or-create step, before the dedup
    # check"), so a same-day repeat that also edits the token reflects the
    # new value on the result, even though no new snapshot is created.
    it "returns the current (possibly just-reset) token, not the token from the first capture, on a same-day repeat" do
      first = described_class.new(payload: valid_ingest_payload(username: "sameday3", read_token: "tok_a")).call

      second = described_class.new(
        payload: valid_ingest_payload(username: "sameday3", read_token: "tok_b"),
      ).call

      expect(second.deduped?).to be(true)
      expect(second.read_token).to eq("tok_b")
      expect(first.ao3_user.reload.read_token).to eq("tok_b")
    end

    it "creates a new snapshot on a later day for the same user" do
      first = described_class.new(payload: valid_ingest_payload(username: "nextday", read_token: "tok")).call

      travel_to(1.day.from_now) do
        expect {
          described_class.new(
            payload: valid_ingest_payload(username: "nextday", read_token: first.read_token),
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
      first = described_class.new(payload: valid_ingest_payload(username: "backfillyear", read_token: "tok")).call

      travel_to(1.day.from_now) do
        described_class.new(
          payload: valid_ingest_payload(
            username: "backfillyear", read_token: first.read_token, earliest_post_year: 2014,
          ),
        ).call
      end

      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "does not overwrite an already-set earliest_post_year on a later ingest, even with a different value" do
      first = described_class.new(
        payload: valid_ingest_payload(username: "returningyear", read_token: "tok", earliest_post_year: 2014),
      ).call

      travel_to(1.day.from_now) do
        described_class.new(
          payload: valid_ingest_payload(
            username: "returningyear", read_token: first.read_token, earliest_post_year: 1999,
          ),
        ).call
      end

      expect(first.ao3_user.reload.earliest_post_year).to eq(2014)
    end

    it "does not overwrite an already-set earliest_post_year on the same-day dedup path" do
      first = described_class.new(
        payload: valid_ingest_payload(username: "dedupyear", read_token: "tok", earliest_post_year: 2014),
      ).call

      second = described_class.new(
        payload: valid_ingest_payload(
          username: "dedupyear", read_token: first.read_token, earliest_post_year: 2020,
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
      first = described_class.new(payload: valid_ingest_payload(username: "dedupbackfill", read_token: "tok")).call

      second = described_class.new(
        payload: valid_ingest_payload(
          username: "dedupbackfill", read_token: first.read_token, earliest_post_year: 2014,
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

  # Interface-pinning regression guards (plan section 3a): the old
  # server-minting/token-verification machinery is deleted outright, not
  # repurposed - always-accept collapses "mint" and "verify-and-reset" into
  # a single "store whatever the client sent" step.
  describe "deleted interface (plan section 3a)" do
    it "no longer defines a TokenMismatch error class" do
      expect(described_class.const_defined?(:TokenMismatch)).to be(false)
    end

    it "no longer defines a private #generate_token method" do
      expect(described_class.private_instance_methods).not_to include(:generate_token)
    end

    it "no longer defines a private #authorize_existing_user! method" do
      expect(described_class.private_instance_methods).not_to include(:authorize_existing_user!)
    end
  end
end
