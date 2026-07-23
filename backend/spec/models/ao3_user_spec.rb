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

    it "requires the read_token to be unique" do
      described_class.create!(username: "userone", read_token: "shared_token")
      dup = described_class.new(username: "usertwo", read_token: "shared_token")

      expect(dup).not_to be_valid
      expect(dup.errors[:read_token]).to be_present
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
end
