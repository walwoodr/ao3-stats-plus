class CreateAo3Users < ActiveRecord::Migration[8.1]
  def change
    create_table :ao3_users do |t|
      t.string :username, null: false
      t.string :read_token, null: false

      t.timestamps
    end

    add_index :ao3_users, :username, unique: true
    add_index :ao3_users, :read_token, unique: true
  end
end
