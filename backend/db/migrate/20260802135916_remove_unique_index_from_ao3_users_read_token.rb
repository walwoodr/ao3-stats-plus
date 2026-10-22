class RemoveUniqueIndexFromAo3UsersReadToken < ActiveRecord::Migration[8.1]
  # `change`'s single-method inference can't reverse a `remove_index` call
  # that only names the index, not its column - Rails has no way to know
  # what to add back. Explicit up/down instead (TECH_DEBT.md, 2026-08-02
  # entry) so `rails db:rollback` restores the original unique index exactly
  # (see 20260722222310_create_ao3_users.rb's `add_index :ao3_users,
  # :read_token, unique: true`) instead of raising
  # ActiveRecord::IrreversibleMigration.
  def up
    remove_index :ao3_users, name: "index_ao3_users_on_read_token"
  end

  def down
    add_index :ao3_users, :read_token, unique: true, name: "index_ao3_users_on_read_token"
  end
end
