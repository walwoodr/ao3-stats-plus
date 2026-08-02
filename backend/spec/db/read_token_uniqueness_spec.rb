require "rails_helper"

# Pins down docs/plans/memorable-token-and-recovery.md section 2's single
# schema change before the migration exists: the global unique index on
# ao3_users.read_token must be dropped, since word-pairs collide across
# users by design (per-username uniqueness, guaranteed by the existing
# unique index on username, is what actually matters - read_token is never
# a lookup key). Written against ActiveRecord::Base.connection introspection
# directly, mirroring spec/db/schema_spec.rb's approach - expected to fail
# until Implementation (stage 4, task 15) adds
# `remove_index :ao3_users, name: "index_ao3_users_on_read_token"`.
RSpec.describe "ao3_users.read_token uniqueness (dropped, plan section 2)", type: :model do
  it "has no unique index named index_ao3_users_on_read_token" do
    expect(
      ActiveRecord::Base.connection.index_exists?(:ao3_users, :read_token, name: "index_ao3_users_on_read_token"),
    ).to be(false)
  end

  it "has no index on read_token at all (it is never a lookup key - every path finds by username)" do
    indexes = ActiveRecord::Base.connection.indexes(:ao3_users)
    read_token_indexes = indexes.select { |i| i.columns == [ "read_token" ] }

    expect(read_token_indexes).to be_empty
  end

  it "still requires read_token at the database level (null: false)" do
    column = ActiveRecord::Base.connection.columns(:ao3_users).find { |c| c.name == "read_token" }

    expect(column).not_to be_nil
    expect(column.null).to be(false)
  end

  it "allows a second user to be created with a read_token equal to an existing user's, without RecordNotUnique" do
    Ao3User.create!(username: "wordpair_owner_one", read_token: "cat-dog")

    expect {
      Ao3User.create!(username: "wordpair_owner_two", read_token: "cat-dog")
    }.not_to raise_error
  end

  it "persists both rows with the shared token intact" do
    first = Ao3User.create!(username: "shared_token_a", read_token: "fox-owl")
    second = Ao3User.create!(username: "shared_token_b", read_token: "fox-owl")

    expect(first.reload.read_token).to eq("fox-owl")
    expect(second.reload.read_token).to eq("fox-owl")
  end

  it "still enforces username uniqueness at the database level (unchanged, per-username scoping still comes from here)" do
    Ao3User.create!(username: "still_unique_username", read_token: "one-two")

    expect {
      Ao3User.new(username: "still_unique_username", read_token: "three-four").save(validate: false)
    }.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
