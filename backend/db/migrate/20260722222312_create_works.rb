class CreateWorks < ActiveRecord::Migration[8.1]
  def change
    create_table :works do |t|
      t.references :ao3_user, null: false, foreign_key: true
      t.bigint :ao3_work_id, null: false
      t.string :title, null: false
      t.string :fandoms, null: false
      t.date :last_seen_on, null: false

      t.timestamps
    end

    add_index :works, [ :ao3_user_id, :ao3_work_id ], unique: true
  end
end
