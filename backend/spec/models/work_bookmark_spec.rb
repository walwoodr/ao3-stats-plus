require "rails_helper"

# WorkBookmark is one public bookmark's latest-known-state details on a
# Work, per docs/plans/work-page-enrichment-data-model.md section 1c -
# replaced wholesale (delete_all + bulk insert) on each work-bookmarks
# capture, never accumulated as history. Every scraped field except the
# owning work is nullable: AO3 tolerates a deleted/orphaned bookmarker
# (bookmarker_name), a bookmark with no note (note_html), no tags
# (bookmarker_tags), an unparseable date (bookmarked_on), and no
# collections (collections) - none of that should ever block storing the
# row itself.
RSpec.describe WorkBookmark, type: :model do
  let(:ao3_user) { Ao3User.create!(username: "bookmark_owner", read_token: "tok_bookmark_owner") }
  let(:work) do
    Work.create!(
      ao3_user: ao3_user,
      ao3_work_id: 4242,
      title: "Bookmarked Fic",
      fandoms: "Some Fandom",
      last_seen_on: Date.current,
    )
  end

  subject(:work_bookmark) do
    described_class.new(
      work: work,
      bookmarker_name: "avid_reader",
      note_html: "<p>Loved this!</p>",
      bookmarker_tags: "fluff, hurt/comfort",
      bookmarked_on: Date.new(2024, 5, 1),
      collections: "Collection A",
    )
  end

  describe "associations" do
    it "belongs to a work" do
      expect(work_bookmark).to respond_to(:work)
    end

    it "requires a work" do
      work_bookmark.work = nil
      expect(work_bookmark).not_to be_valid
    end
  end

  describe "validations" do
    it "is valid with every field populated" do
      expect(work_bookmark).to be_valid
    end

    it "is valid with a nil bookmarker_name (deleted/orphaned account)" do
      work_bookmark.bookmarker_name = nil
      expect(work_bookmark).to be_valid
    end

    it "is valid with a nil note_html (no note left)" do
      work_bookmark.note_html = nil
      expect(work_bookmark).to be_valid
    end

    it "is valid with a nil bookmarker_tags (no tags)" do
      work_bookmark.bookmarker_tags = nil
      expect(work_bookmark).to be_valid
    end

    it "is valid with a nil bookmarked_on (unparseable date)" do
      work_bookmark.bookmarked_on = nil
      expect(work_bookmark).to be_valid
    end

    it "is valid with a nil collections (no collections)" do
      work_bookmark.collections = nil
      expect(work_bookmark).to be_valid
    end

    it "is valid with every optional field nil at once (the minimal-possible scraped row)" do
      work_bookmark.assign_attributes(
        bookmarker_name: nil, note_html: nil, bookmarker_tags: nil,
        bookmarked_on: nil, collections: nil,
      )
      expect(work_bookmark).to be_valid
    end
  end

  describe "delete-and-replace semantics (1c)" do
    it "allows more than one bookmark row per work (a list, not a singleton)" do
      work_bookmark.save!
      second = described_class.new(work: work, bookmarker_name: "second_reader")

      expect(second).to be_valid
    end

    it "removing the work's whole bookmark list via delete_all leaves no orphaned rows" do
      work_bookmark.save!
      described_class.create!(work: work, bookmarker_name: "second_reader")

      work.work_bookmarks.delete_all

      expect(described_class.where(work: work).count).to eq(0)
    end
  end
end
