class AddWorkPageEnrichmentColumnsToWorks < ActiveRecord::Migration[8.1]
  def change
    # Latest-state identity/status fields (plan section 1b) - all nullable,
    # overwritten on each work-page capture rather than accumulated.
    add_column :works, :published_on, :date, null: true
    add_column :works, :series, :string, null: true
    add_column :works, :complete, :boolean, null: true
    add_column :works, :work_page_captured_at, :datetime, null: true
  end
end
