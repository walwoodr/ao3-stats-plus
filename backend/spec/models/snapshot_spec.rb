require "rails_helper"

# Snapshot is a single point-in-time aggregate reading for one Ao3User,
# keyed by server-derived captured_on (date) - the (ao3_user_id, captured_on)
# unique index is the dedup mechanism described in the plan.
RSpec.describe Snapshot, type: :model do
  let(:ao3_user) { Ao3User.create!(username: "snapshot_owner", read_token: "tok_snap") }

  subject(:snapshot) do
    described_class.new(
      ao3_user: ao3_user,
      captured_on: Date.current,
      captured_at: Time.current,
      total_hits: 100,
      total_kudos: 10,
      total_comments: 5,
      total_bookmarks: 3,
      total_subscriptions: 2,
      total_user_subscriptions: 1,
      total_word_count: 50_000,
      works_count: 4,
    )
  end

  describe "validations" do
    it "is valid with all required attributes" do
      expect(snapshot).to be_valid
    end

    it "requires captured_on" do
      snapshot.captured_on = nil
      expect(snapshot).not_to be_valid
    end

    it "requires captured_at" do
      snapshot.captured_at = nil
      expect(snapshot).not_to be_valid
    end

    %i[
      total_hits total_kudos total_comments total_bookmarks
      total_subscriptions total_user_subscriptions total_word_count works_count
    ].each do |attr|
      it "rejects a negative #{attr}" do
        snapshot.public_send("#{attr}=", -1)
        expect(snapshot).not_to be_valid
      end

      it "accepts zero for #{attr}" do
        snapshot.public_send("#{attr}=", 0)
        expect(snapshot).to be_valid
      end
    end

    it "rejects a second snapshot for the same user on the same captured_on" do
      snapshot.save!
      dup = described_class.new(snapshot.attributes.except("id"))
      dup.ao3_user = ao3_user

      expect(dup).not_to be_valid
    end

    it "enforces the (ao3_user_id, captured_on) uniqueness at the database level" do
      snapshot.save!
      dup = described_class.new(snapshot.attributes.except("id"))
      dup.ao3_user = ao3_user

      expect { dup.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "allows the same captured_on for two different users" do
      other_user = Ao3User.create!(username: "other_snapshot_owner", read_token: "tok_snap2")
      snapshot.save!
      other = described_class.new(snapshot.attributes.except("id"))
      other.ao3_user = other_user

      expect(other).to be_valid
    end
  end

  describe "associations" do
    it "belongs to an ao3_user" do
      expect(snapshot).to respond_to(:ao3_user)
    end

    it "has many work_stats" do
      expect(snapshot).to respond_to(:work_stats)
    end

    it "requires an ao3_user" do
      snapshot.ao3_user = nil
      expect(snapshot).not_to be_valid
    end
  end
end
