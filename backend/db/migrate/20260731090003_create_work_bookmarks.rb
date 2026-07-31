class CreateWorkBookmarks < ActiveRecord::Migration[8.1]
  def change
    # Latest-known-state list (plan section 1c): replaced wholesale
    # (delete_all + bulk insert) on each work-bookmarks capture, never
    # accumulated as history. Every field except work_id is nullable -
    # deleted/orphaned bookmarkers, notes, tags, dates, and collections may
    # all legitimately be absent from an otherwise-valid scraped row.
    create_table :work_bookmarks do |t|
      t.references :work, null: false, foreign_key: true
      t.string :bookmarker_name
      t.text :note_html
      t.string :bookmarker_tags
      t.date :bookmarked_on
      t.string :collections

      t.timestamps
    end
  end
end
