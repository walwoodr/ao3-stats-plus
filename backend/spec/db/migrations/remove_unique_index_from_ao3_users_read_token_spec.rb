require "rails_helper"

# Regression test (TECH_DEBT.md, 2026-08-02 entry): this migration's
# `remove_index :ao3_users, name: "index_ao3_users_on_read_token"` call,
# previously wrapped in a single `change` method with no column given,
# can't be auto-reversed by Rails - `rails db:rollback` raised
# ActiveRecord::IrreversibleMigration. Explicit up/down fixes this; exercised
# here directly against the real connection (both DDL statements run inside
# this example's own transactional-fixtures wrapper, per spec/rails_helper.rb,
# so Postgres's transactional DDL rolls each back automatically at the end of
# the example - no manual schema cleanup needed).
RSpec.describe "db/migrate/20260802135916_remove_unique_index_from_ao3_users_read_token.rb" do
  before(:all) do
    require Rails.root.join(
      "db/migrate/20260802135916_remove_unique_index_from_ao3_users_read_token.rb",
    ).to_s
  end

  subject(:migration) { RemoveUniqueIndexFromAo3UsersReadToken.new }

  def index_present?(unique: nil)
    options = { name: "index_ao3_users_on_read_token" }
    options[:unique] = unique unless unique.nil?
    ActiveRecord::Base.connection.index_exists?(:ao3_users, :read_token, **options)
  end

  it "down restores the original unique index without raising IrreversibleMigration" do
    expect { migration.down }.not_to raise_error
    expect(index_present?(unique: true)).to be true
  end

  it "up removes the index again (round-trip back to the already-migrated schema)" do
    migration.down
    migration.up
    expect(index_present?).to be false
  end
end
