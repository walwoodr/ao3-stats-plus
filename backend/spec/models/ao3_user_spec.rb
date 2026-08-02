require "rails_helper"

# Ao3User is the per-author identity record: one row per AO3 username, with
# a capability token minted on first ingest and required on every later one.
RSpec.describe Ao3User, type: :model do
  subject(:ao3_user) { described_class.new(username: "someauthor", read_token: "tok_abc123") }

  describe "validations" do
    it "is valid with a username and read_token" do
      expect(ao3_user).to be_valid
    end

    it "requires a username" do
      ao3_user.username = nil
      expect(ao3_user).not_to be_valid
    end

    it "requires the username to be unique" do
      described_class.create!(username: "dupeuser", read_token: "tok_1")
      dup = described_class.new(username: "dupeuser", read_token: "tok_2")

      expect(dup).not_to be_valid
      expect(dup.errors[:username]).to be_present
    end

    it "enforces username uniqueness at the database level, not just in-memory" do
      described_class.create!(username: "dbdupe", read_token: "tok_3")
      dup = described_class.new(username: "dbdupe", read_token: "tok_4")
      expect { dup.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)

      expect(described_class.where(username: "dbdupe").count).to eq(1)
    end

    it "requires a read_token" do
      ao3_user.read_token = nil
      expect(ao3_user).not_to be_valid
    end

    # Per docs/plans/memorable-token-and-recovery.md section 2: word-pairs
    # collide across users by design (per-username scoping only), so
    # uniqueness is deliberately no longer validated - two rows may share a
    # read_token value.
    it "no longer validates read_token uniqueness - two rows may share a read_token" do
      described_class.create!(username: "userone", read_token: "shared_token")
      dup = described_class.new(username: "usertwo", read_token: "shared_token")

      expect(dup).to be_valid
      expect(dup.errors[:read_token]).to be_empty
    end

    it "persists two rows with the same read_token without raising" do
      described_class.create!(username: "userthree", read_token: "shared_token_2")

      expect {
        described_class.create!(username: "userfour", read_token: "shared_token_2")
      }.not_to raise_error
    end
  end

  describe "associations" do
    it "has many snapshots" do
      expect(ao3_user).to respond_to(:snapshots)
    end

    it "has many works" do
      expect(ao3_user).to respond_to(:works)
    end
  end

  # earliest_post_year is a nullable, supplementary fact (the synthetic
  # zero-point baseline year, captured on a user's first-ever ingest) - it
  # must never be required for the record to be valid.
  describe "earliest_post_year" do
    it "is valid without an earliest_post_year set" do
      ao3_user.earliest_post_year = nil
      expect(ao3_user).to be_valid
    end

    it "is valid with an earliest_post_year set" do
      ao3_user.earliest_post_year = 2014
      expect(ao3_user).to be_valid
    end

    it "persists the value across a reload" do
      ao3_user.earliest_post_year = 2014
      ao3_user.save!
      expect(ao3_user.reload.earliest_post_year).to eq(2014)
    end
  end
end
