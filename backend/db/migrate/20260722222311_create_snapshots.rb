class CreateSnapshots < ActiveRecord::Migration[8.1]
  def change
    create_table :snapshots do |t|
      t.references :ao3_user, null: false, foreign_key: true
      t.date :captured_on, null: false
      t.datetime :captured_at, null: false
      t.integer :total_hits, null: false, default: 0
      t.integer :total_kudos, null: false, default: 0
      t.integer :total_comments, null: false, default: 0
      t.integer :total_bookmarks, null: false, default: 0
      t.integer :total_subscriptions, null: false, default: 0
      t.integer :total_user_subscriptions, null: false, default: 0
      t.integer :total_word_count, null: false, default: 0
      t.integer :works_count, null: false, default: 0

      t.timestamps
    end

    add_index :snapshots, [ :ao3_user_id, :captured_on ], unique: true
  end
end
