require "rails_helper"

# Pins down the schema delta from docs/plans/work-page-enrichment-data-model.md
# section 1e ("Full proposed schema delta at a glance") before any migration
# exists. Written against ActiveRecord::Base.connection introspection rather
# than fixtures/models, so it exercises the real Postgres schema directly -
# these specs are expected to fail until Implementation (stage 4, task 10)
# adds the three migrations in the plan's stated order (work_stats columns,
# works columns, work_bookmarks table).
RSpec.describe "work-page enrichment schema", type: :model do
  def column_for(table, name)
    ActiveRecord::Base.connection.columns(table).find { |c| c.name == name.to_s }
  end

  describe "new work_stats columns (1a: time-series, nullable, NO default)" do
    %i[public_bookmarks visible_comments chapter_count chapters_expected].each do |col|
      it "adds an integer, nullable, no-default #{col} column" do
        column = column_for(:work_stats, col)

        expect(column).not_to be_nil, "expected work_stats.#{col} to exist"
        expect(column.sql_type).to match(/int/)
        expect(column.null).to be(true)
        # A default of 0 would silently fabricate zero-points for every
        # stats-only snapshot (plan 1a) - this is the load-bearing NULL-vs-0
        # distinction, so it's asserted explicitly rather than assumed.
        expect(column.default).to be_nil
      end
    end
  end

  describe "new works columns (1b: latest-state identity/status)" do
    it "adds a nullable date published_on column" do
      column = column_for(:works, :published_on)

      expect(column).not_to be_nil, "expected works.published_on to exist"
      expect(column.sql_type).to eq("date")
      expect(column.null).to be(true)
    end

    it "adds a nullable string series column, mirroring the existing fandoms column's shape" do
      column = column_for(:works, :series)

      expect(column).not_to be_nil, "expected works.series to exist"
      expect(column.sql_type).to match(/character varying|text/)
      expect(column.null).to be(true)
    end

    it "adds a nullable boolean complete column" do
      column = column_for(:works, :complete)

      expect(column).not_to be_nil, "expected works.complete to exist"
      expect(column.sql_type).to eq("boolean")
      expect(column.null).to be(true)
    end

    it "adds a nullable datetime work_page_captured_at provenance column" do
      column = column_for(:works, :work_page_captured_at)

      expect(column).not_to be_nil, "expected works.work_page_captured_at to exist"
      expect(column.sql_type).to match(/timestamp/)
      expect(column.null).to be(true)
    end
  end

  describe "new work_bookmarks table (1c: latest-state, delete-and-replace)" do
    it "exists" do
      expect(ActiveRecord::Base.connection.table_exists?(:work_bookmarks)).to be(true)
    end

    it "has a not-null work_id foreign key column" do
      column = column_for(:work_bookmarks, :work_id)

      expect(column).not_to be_nil, "expected work_bookmarks.work_id to exist"
      expect(column.null).to be(false)
    end

    it "enforces the work_id foreign key at the database level" do
      expect(
        ActiveRecord::Base.connection.foreign_key_exists?(:work_bookmarks, :works),
      ).to be(true)
    end

    it "indexes work_id (via t.references' default index)" do
      expect(
        ActiveRecord::Base.connection.index_exists?(:work_bookmarks, :work_id),
      ).to be(true)
    end

    it "has a nullable bookmarker_name column (deleted/orphaned accounts tolerated)" do
      column = column_for(:work_bookmarks, :bookmarker_name)

      expect(column).not_to be_nil, "expected work_bookmarks.bookmarker_name to exist"
      expect(column.null).to be(true)
    end

    it "has a nullable text note_html column" do
      column = column_for(:work_bookmarks, :note_html)

      expect(column).not_to be_nil, "expected work_bookmarks.note_html to exist"
      expect(column.sql_type).to match(/text/)
      expect(column.null).to be(true)
    end

    it "has a nullable string bookmarker_tags column, comma-joined like fandoms/series" do
      column = column_for(:work_bookmarks, :bookmarker_tags)

      expect(column).not_to be_nil, "expected work_bookmarks.bookmarker_tags to exist"
      expect(column.null).to be(true)
    end

    it "has a nullable date bookmarked_on column (NULL if unparseable)" do
      column = column_for(:work_bookmarks, :bookmarked_on)

      expect(column).not_to be_nil, "expected work_bookmarks.bookmarked_on to exist"
      expect(column.sql_type).to eq("date")
      expect(column.null).to be(true)
    end

    it "has a nullable string collections column" do
      column = column_for(:work_bookmarks, :collections)

      expect(column).not_to be_nil, "expected work_bookmarks.collections to exist"
      expect(column.null).to be(true)
    end

    it "has created_at/updated_at timestamps" do
      expect(column_for(:work_bookmarks, :created_at)).not_to be_nil
      expect(column_for(:work_bookmarks, :updated_at)).not_to be_nil
    end
  end

  # 1d: explicitly nothing new on snapshots (aggregate public/visible sums are
  # derived at query time, never stored) - a regression guard so a future
  # change doesn't silently reintroduce the redundant aggregate the plan
  # rejected.
  describe "snapshots (1d: deliberately unchanged)" do
    it "gains no new columns for this feature" do
      column_names = ActiveRecord::Base.connection.columns(:snapshots).map(&:name)

      expect(column_names).not_to include("public_bookmarks", "visible_comments", "total_public_bookmarks",
        "total_visible_comments")
    end
  end
end
