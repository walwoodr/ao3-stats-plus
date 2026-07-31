require "rails_helper"

# Read-path coverage for the work-page enrichment fields added to the
# existing statsForUser query (docs/plans/work-page-enrichment-data-model.md
# section 4): new nullable fields on PerWorkPointType and PerWorkSeriesType,
# plus the new WorkBookmarkType list. A dedicated query file (not folded
# into spec/requests/graphql/stats_for_user_spec.rb's shared `query`)
# because a still-missing field would otherwise invalidate that shared
# query and cascade-fail every other test in that file - same rationale as
# its own earliestPostYear describe block.
RSpec.describe "statsForUser query - work-page enrichment fields", type: :request do
  let!(:ao3_user) { Ao3User.create!(username: "enricheduser", read_token: "valid_token") }

  def create_snapshot(captured_on: Date.current)
    Snapshot.create!(
      ao3_user: ao3_user, captured_on: captured_on, captured_at: captured_on.to_time,
      total_hits: 0, total_kudos: 0, total_comments: 0, total_bookmarks: 0,
      total_subscriptions: 0, total_user_subscriptions: 0, total_word_count: 0, works_count: 1,
    )
  end

  def create_work(ao3_work_id: 555, **attrs)
    Work.create!(
      { ao3_user: ao3_user, ao3_work_id: ao3_work_id, title: "Enriched Fic",
        fandoms: "Fandom X", last_seen_on: Date.current }.merge(attrs),
    )
  end

  def graphql_post(query:, variables:, origin: "http://localhost:5173")
    post "/graphql",
      params: { query: query, variables: variables }.to_json,
      headers: { "Content-Type" => "application/json", "Origin" => origin }
  end

  describe "PerWorkPointType new time-series fields" do
    let(:query) { <<~GRAPHQL }
      query StatsForUser($username: String!, $token: String!) {
        statsForUser(username: $username, token: $token) {
          perWorkSeries {
            ao3WorkId
            points {
              publicBookmarks
              visibleComments
              chapterCount
              chaptersExpected
              privateBookmarks
            }
          }
        }
      }
    GRAPHQL

    def points_for(ao3_work_id)
      response.parsed_body.dig("data", "statsForUser", "perWorkSeries")
        .find { |w| w["ao3WorkId"] == ao3_work_id }["points"].first
    end

    it "returns the captured enrichment values when the work page was scraped" do
      snapshot = create_snapshot
      work = create_work
      WorkStat.create!(
        snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0, bookmarks: 9,
        subscriptions: 0, word_count: 100,
        public_bookmarks: 6, visible_comments: 14, chapter_count: 3, chapters_expected: 12,
      )

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(points_for(555)).to include(
        "publicBookmarks" => 6, "visibleComments" => 14, "chapterCount" => 3, "chaptersExpected" => 12,
      )
    end

    it "returns null (never a fabricated zero) for a snapshot never enriched by Phase 2" do
      snapshot = create_snapshot
      work = create_work
      WorkStat.create!(
        snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0, bookmarks: 9,
        subscriptions: 0, word_count: 100,
      )

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(points_for(555)).to include(
        "publicBookmarks" => nil, "visibleComments" => nil, "chapterCount" => nil, "chaptersExpected" => nil,
      )
    end

    describe "privateBookmarks (derived: bookmarks - publicBookmarks, clamped >= 0)" do
      it "computes the difference when publicBookmarks is present" do
        snapshot = create_snapshot
        work = create_work
        WorkStat.create!(
          snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0, bookmarks: 9,
          subscriptions: 0, word_count: 100, public_bookmarks: 6,
        )

        graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

        expect(points_for(555)["privateBookmarks"]).to eq(3)
      end

      it "is null when publicBookmarks was never captured" do
        snapshot = create_snapshot
        work = create_work
        WorkStat.create!(
          snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0, bookmarks: 9,
          subscriptions: 0, word_count: 100,
        )

        graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

        expect(points_for(555)["privateBookmarks"]).to be_nil
      end

      it "clamps to 0 rather than a negative when publicBookmarks momentarily exceeds bookmarks" do
        snapshot = create_snapshot
        work = create_work
        WorkStat.create!(
          snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0, bookmarks: 6,
          subscriptions: 0, word_count: 100, public_bookmarks: 9,
        )

        graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

        expect(points_for(555)["privateBookmarks"]).to eq(0)
      end
    end
  end

  describe "PerWorkSeriesType new latest-state identity fields" do
    let(:query) { <<~GRAPHQL }
      query StatsForUser($username: String!, $token: String!) {
        statsForUser(username: $username, token: $token) {
          perWorkSeries {
            ao3WorkId
            publishedOn
            series
            complete
          }
        }
      }
    GRAPHQL

    def series_entry_for(ao3_work_id)
      response.parsed_body.dig("data", "statsForUser", "perWorkSeries").find { |w| w["ao3WorkId"] == ao3_work_id }
    end

    it "returns publishedOn/series/complete when the work has been captured by Phase 2" do
      create_snapshot
      create_work(published_on: Date.new(2023, 5, 1), series: "Series One, Series Two", complete: true)

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(series_entry_for(555)).to include(
        "publishedOn" => "2023-05-01", "series" => "Series One, Series Two", "complete" => true,
      )
    end

    it "returns null for a work never enriched by Phase 2, rather than a fabricated value" do
      create_snapshot
      create_work

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(series_entry_for(555)).to include("publishedOn" => nil, "series" => nil, "complete" => nil)
    end
  end

  describe "PerWorkSeriesType#bookmarks (the work_bookmarks list via WorkBookmarkType)" do
    let(:query) { <<~GRAPHQL }
      query StatsForUser($username: String!, $token: String!) {
        statsForUser(username: $username, token: $token) {
          perWorkSeries {
            ao3WorkId
            bookmarks {
              bookmarkerName
              noteHtml
              bookmarkerTags
              bookmarkedOn
              collections
            }
          }
        }
      }
    GRAPHQL

    def bookmarks_for(ao3_work_id)
      response.parsed_body.dig("data", "statsForUser", "perWorkSeries")
        .find { |w| w["ao3WorkId"] == ao3_work_id }["bookmarks"]
    end

    it "returns each bookmark's fields" do
      create_snapshot
      work = create_work
      work.work_bookmarks.create!(
        bookmarker_name: "avid_reader", note_html: "<p>Loved this!</p>",
        bookmarker_tags: "fluff", bookmarked_on: Date.new(2024, 5, 1), collections: "Collection A",
      )

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(bookmarks_for(555)).to eq(
        [
          {
            "bookmarkerName" => "avid_reader", "noteHtml" => "<p>Loved this!</p>",
            "bookmarkerTags" => "fluff", "bookmarkedOn" => "2024-05-01", "collections" => "Collection A"
          }
        ],
      )
    end

    it "returns an empty list, not null or an error, for a work with zero public bookmarks" do
      create_snapshot
      create_work

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(bookmarks_for(555)).to eq([])
    end

    it "tolerates a nil bookmarker_name (deleted/orphaned account) without erroring the whole query" do
      create_snapshot
      work = create_work
      work.work_bookmarks.create!(bookmarker_name: nil, note_html: nil)

      graphql_post(query: query, variables: { username: "enricheduser", token: "valid_token" })

      expect(response.parsed_body["errors"]).to be_blank
      expect(bookmarks_for(555).first).to include("bookmarkerName" => nil)
    end
  end
end
