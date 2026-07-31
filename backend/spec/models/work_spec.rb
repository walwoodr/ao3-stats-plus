require "rails_helper"

# Work is a per-fic identity record, upserted on every ingest and keyed by
# (ao3_user_id, ao3_work_id). fandoms is a comma-joined string because a work
# can appear under multiple fandoms on AO3's stats page (deduped upstream by
# the ingest service, unioned into this one field).
RSpec.describe Work, type: :model do
  let(:ao3_user) { Ao3User.create!(username: "work_owner", read_token: "tok_work") }

  subject(:work) do
    described_class.new(
      ao3_user: ao3_user,
      ao3_work_id: 123_456,
      title: "A Sample Fic",
      fandoms: "Fandom One, Fandom Two",
      last_seen_on: Date.current,
    )
  end

  describe "validations" do
    it "is valid with all required attributes" do
      expect(work).to be_valid
    end

    it "requires an ao3_work_id" do
      work.ao3_work_id = nil
      expect(work).not_to be_valid
    end

    it "requires a title" do
      work.title = nil
      expect(work).not_to be_valid
    end

    it "requires last_seen_on" do
      work.last_seen_on = nil
      expect(work).not_to be_valid
    end

    it "stores fandoms as a comma-joined string" do
      work.save!
      expect(work.reload.fandoms).to eq("Fandom One, Fandom Two")
    end

    it "rejects a second work for the same user with the same ao3_work_id" do
      work.save!
      dup = described_class.new(work.attributes.except("id"))
      dup.ao3_user = ao3_user

      expect(dup).not_to be_valid
    end

    it "enforces the (ao3_user_id, ao3_work_id) uniqueness at the database level" do
      work.save!
      dup = described_class.new(work.attributes.except("id"))
      dup.ao3_user = ao3_user

      expect { dup.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "allows the same ao3_work_id for two different users (co-authored works)" do
      other_user = Ao3User.create!(username: "co_author", read_token: "tok_coauthor")
      work.save!
      other = described_class.new(work.attributes.except("id"))
      other.ao3_user = other_user

      expect(other).to be_valid
    end
  end

  describe "associations" do
    it "belongs to an ao3_user" do
      expect(work).to respond_to(:ao3_user)
    end

    it "has many work_stats" do
      expect(work).to respond_to(:work_stats)
    end

    # New for work-page enrichment (docs/plans/work-page-enrichment-data-model.md
    # section 1c): the delete-and-replace bookmark-notes list.
    it "has many work_bookmarks" do
      expect(work).to respond_to(:work_bookmarks)
    end

    it "requires an ao3_user" do
      work.ao3_user = nil
      expect(work).not_to be_valid
    end
  end

  # New latest-state identity/status fields from work-page enrichment (plan
  # section 1b) - all nullable, overwritten on each work-page capture, so a
  # work that has never had one is still a perfectly valid record.
  describe "work-page enrichment fields (1b)" do
    it "is valid with published_on, series, complete, and work_page_captured_at all nil (never captured)" do
      work.published_on = nil
      work.series = nil
      work.complete = nil
      work.work_page_captured_at = nil

      expect(work).to be_valid
    end

    it "is valid once populated from a work-page capture" do
      work.published_on = Date.new(2023, 5, 1)
      work.series = "Series One, Series Two"
      work.complete = true
      work.work_page_captured_at = Time.current

      expect(work).to be_valid
    end

    it "stores series as a comma-joined string, identical in shape to fandoms" do
      work.series = "Series One, Series Two"
      work.save!

      expect(work.reload.series).to eq("Series One, Series Two")
    end
  end
end
