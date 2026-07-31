class AddWorkPageEnrichmentColumnsToWorkStats < ActiveRecord::Migration[8.1]
  def change
    # All nullable, NO default (plan section 1a): NULL means "this work page
    # wasn't scraped for this snapshot," 0 means "scraped, and it's genuinely
    # zero." A default of 0 would silently fabricate zero-points for every
    # stats-only snapshot.
    add_column :work_stats, :public_bookmarks, :integer, null: true
    add_column :work_stats, :visible_comments, :integer, null: true
    add_column :work_stats, :chapter_count, :integer, null: true
    add_column :work_stats, :chapters_expected, :integer, null: true
  end
end
