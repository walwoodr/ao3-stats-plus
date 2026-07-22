class CreateWorkStats < ActiveRecord::Migration[8.1]
  def change
    create_table :work_stats do |t|
      t.references :snapshot, null: false, foreign_key: true
      t.references :work, null: false, foreign_key: true
      t.integer :hits, null: false, default: 0
      t.integer :kudos, null: false, default: 0
      t.integer :comments, null: false, default: 0
      t.integer :bookmarks, null: false, default: 0
      t.integer :subscriptions, null: false, default: 0
      t.integer :word_count, null: false, default: 0

      t.timestamps
    end

    add_index :work_stats, [ :snapshot_id, :work_id ], unique: true
  end
end
