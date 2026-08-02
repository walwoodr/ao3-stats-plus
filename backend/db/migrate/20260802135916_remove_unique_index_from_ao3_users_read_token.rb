class RemoveUniqueIndexFromAo3UsersReadToken < ActiveRecord::Migration[8.1]
  def change
    remove_index :ao3_users, name: "index_ao3_users_on_read_token"
  end
end
