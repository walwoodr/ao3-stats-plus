class AddEarliestPostYearToAo3Users < ActiveRecord::Migration[8.1]
  def change
    add_column :ao3_users, :earliest_post_year, :integer
  end
end
