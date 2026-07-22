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
end
