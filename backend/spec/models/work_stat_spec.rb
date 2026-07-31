require "rails_helper"

# WorkStat is the per-work reading captured in a given Snapshot - the join
# between a Work and a Snapshot, keyed uniquely by (snapshot_id, work_id).
RSpec.describe WorkStat, type: :model do
  let(:ao3_user) { Ao3User.create!(username: "workstat_owner", read_token: "tok_workstat") }
  let(:snapshot) do
    Snapshot.create!(
      ao3_user: ao3_user,
      captured_on: Date.current,
      captured_at: Time.current,
      total_hits: 0,
      total_kudos: 0,
      total_comments: 0,
      total_bookmarks: 0,
      total_subscriptions: 0,
      total_user_subscriptions: 0,
      total_word_count: 0,
      works_count: 1,
    )
  end
  let(:work) do
    Work.create!(
      ao3_user: ao3_user,
      ao3_work_id: 999,
      title: "Statted Fic",
      fandoms: "Some Fandom",
      last_seen_on: Date.current,
    )
  end

  subject(:work_stat) do
    described_class.new(
      snapshot: snapshot,
      work: work,
      hits: 10,
      kudos: 5,
      comments: 2,
      bookmarks: 1,
      subscriptions: 0,
      word_count: 1_200,
    )
  end

  describe "validations" do
    it "is valid with all required attributes" do
      expect(work_stat).to be_valid
    end

    %i[hits kudos comments bookmarks subscriptions word_count].each do |attr|
      it "rejects a negative #{attr}" do
        work_stat.public_send("#{attr}=", -1)
        expect(work_stat).not_to be_valid
      end

      it "accepts zero for #{attr}" do
        work_stat.public_send("#{attr}=", 0)
        expect(work_stat).to be_valid
      end
    end

    it "rejects a second work_stat for the same snapshot and work" do
      work_stat.save!
      dup = described_class.new(work_stat.attributes.except("id"))
      dup.snapshot = snapshot
      dup.work = work

      expect(dup).not_to be_valid
    end

    it "enforces the (snapshot_id, work_id) uniqueness at the database level" do
      work_stat.save!
      dup = described_class.new(work_stat.attributes.except("id"))
      dup.snapshot = snapshot
      dup.work = work

      expect { dup.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end

  describe "associations" do
    it "belongs to a snapshot" do
      expect(work_stat).to respond_to(:snapshot)
    end

    it "belongs to a work" do
      expect(work_stat).to respond_to(:work)
    end

    it "requires a snapshot" do
      work_stat.snapshot = nil
      expect(work_stat).not_to be_valid
    end

    it "requires a work" do
      work_stat.work = nil
      expect(work_stat).not_to be_valid
    end
  end

  # New work-page enrichment columns (docs/plans/work-page-enrichment-data-model.md
  # section 1a): unlike the pre-existing counters above, these are nullable
  # with NO default - NULL means "this work page wasn't scraped for this
  # snapshot," 0 means "scraped, and it's genuinely zero." A `default 0`
  # migration would silently fabricate zero-points, so both states are
  # asserted explicitly here, not just "any integer is fine."
  describe "NULL-vs-0 semantics for public_bookmarks/visible_comments/chapter_count/chapters_expected" do
    %i[public_bookmarks visible_comments chapter_count chapters_expected].each do |attr|
      it "is valid when #{attr} is nil (work page not yet scraped for this snapshot)" do
        work_stat.public_send("#{attr}=", nil)
        expect(work_stat).to be_valid
      end

      it "is valid when #{attr} is explicitly 0 (scraped, and it's genuinely zero)" do
        # chapters_expected=0 alone would trip the chapter_count/chapters_expected
        # pairing validation below (chapters_expected requires chapter_count) -
        # that pairing is exercised on its own in the dedicated describe block
        # further down, so here it's paired with a same-value chapter_count to
        # isolate this test to its actual concern (NULL vs. 0).
        work_stat.chapter_count = 0 if attr == :chapters_expected
        work_stat.public_send("#{attr}=", 0)
        expect(work_stat).to be_valid
      end

      it "rejects a negative #{attr}" do
        work_stat.public_send("#{attr}=", -1)
        expect(work_stat).not_to be_valid
      end
    end

    it "persists nil and 0 as distinguishable values, not coerced to the same thing" do
      work_stat.public_bookmarks = 0
      work_stat.visible_comments = nil
      work_stat.save!
      work_stat.reload

      expect(work_stat.public_bookmarks).to eq(0)
      expect(work_stat.visible_comments).to be_nil
    end
  end

  # chapter_count/chapters_expected are two halves of one "N/M as seen that
  # day" reading (plan section 1a) - both time-series, captured from the
  # same chapter_total_display parse. chapters_expected nil represents
  # AO3's own open-ended "?" ("N/?"), which is why it must be independently
  # nilable from chapter_count, but a *chapters_expected* on its own with no
  # posted chapter_count would be a nonsensical reading no real scrape could
  # produce, so that combination is rejected.
  describe "chapter_count/chapters_expected pairing" do
    it "is valid with chapter_count present and chapters_expected nil (AO3's open-ended '?' WIP)" do
      work_stat.chapter_count = 3
      work_stat.chapters_expected = nil
      expect(work_stat).to be_valid
    end

    it "is valid with both chapter_count and chapters_expected present (a closed 'N/M' reading)" do
      work_stat.chapter_count = 3
      work_stat.chapters_expected = 12
      expect(work_stat).to be_valid
    end

    it "is valid with both nil (work page not yet scraped for this snapshot)" do
      work_stat.chapter_count = nil
      work_stat.chapters_expected = nil
      expect(work_stat).to be_valid
    end

    it "rejects chapters_expected present without chapter_count (no scrape produces this combination)" do
      work_stat.chapter_count = nil
      work_stat.chapters_expected = 12
      expect(work_stat).not_to be_valid
    end

    it "rejects chapters_expected less than chapter_count (can't expect fewer than already posted)" do
      work_stat.chapter_count = 5
      work_stat.chapters_expected = 3
      expect(work_stat).not_to be_valid
    end
  end

  # Derived, NOT stored (plan section 1a "Derived, NOT stored"): private
  # bookmarks = bookmarks - public_bookmarks, clamped to >= 0 to tolerate a
  # bookmark added between the two scrapes within one fan-out run, computed
  # only when public_bookmarks was actually captured this snapshot.
  describe "#private_bookmarks (derived, not a stored column)" do
    it "is nil when public_bookmarks was not captured this snapshot" do
      work_stat.bookmarks = 10
      work_stat.public_bookmarks = nil
      expect(work_stat.private_bookmarks).to be_nil
    end

    it "is bookmarks minus public_bookmarks when both are present" do
      work_stat.bookmarks = 10
      work_stat.public_bookmarks = 6
      expect(work_stat.private_bookmarks).to eq(4)
    end

    it "is 0 when public_bookmarks equals bookmarks" do
      work_stat.bookmarks = 6
      work_stat.public_bookmarks = 6
      expect(work_stat.private_bookmarks).to eq(0)
    end

    it "clamps to 0 rather than going negative when public_bookmarks momentarily exceeds bookmarks" do
      work_stat.bookmarks = 6
      work_stat.public_bookmarks = 9
      expect(work_stat.private_bookmarks).to eq(0)
    end
  end
end
