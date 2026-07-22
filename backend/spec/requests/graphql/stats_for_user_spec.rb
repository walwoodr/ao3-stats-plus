require "rails_helper"

# statsForUser(username, token) is the read path for the frontend dashboard.
# Unlike POST /ingest, this is real GraphQL, CORS-scoped to our own frontend
# origin only (never AO3's) - see the CORS section below.
RSpec.describe "statsForUser query", type: :request do
  let(:query) { <<~GRAPHQL }
    query StatsForUser($username: String!, $token: String!) {
      statsForUser(username: $username, token: $token) {
        kudosToHitsRatio
        aggregateSeries {
          capturedOn
          totalHits
          totalKudos
          kudosToHitsRatio
        }
        perWorkSeries {
          ao3WorkId
          title
          fandoms
          points {
            capturedOn
            hits
            kudos
          }
        }
      }
    }
  GRAPHQL

  def graphql_post(variables:, origin: "http://localhost:5173")
    post "/graphql",
      params: { query: query, variables: variables }.to_json,
      headers: { "Content-Type" => "application/json", "Origin" => origin }
  end

  let!(:ao3_user) { Ao3User.create!(username: "chartuser", read_token: "valid_token") }

  def create_snapshot(captured_on:, total_hits:, total_kudos:)
    Snapshot.create!(
      ao3_user: ao3_user,
      captured_on: captured_on,
      captured_at: captured_on.to_time,
      total_hits: total_hits,
      total_kudos: total_kudos,
      total_comments: 0,
      total_bookmarks: 0,
      total_subscriptions: 0,
      total_user_subscriptions: 0,
      total_word_count: 0,
      works_count: 0,
    )
  end

  context "with a valid token" do
    before do
      create_snapshot(captured_on: 2.days.ago.to_date, total_hits: 100, total_kudos: 10)
      create_snapshot(captured_on: 1.day.ago.to_date, total_hits: 200, total_kudos: 20)
    end

    it "returns no errors" do
      graphql_post(variables: { username: "chartuser", token: "valid_token" })
      expect(response.parsed_body["errors"]).to be_blank
    end

    it "returns the aggregate series ordered by capturedOn ascending" do
      graphql_post(variables: { username: "chartuser", token: "valid_token" })
      series = response.parsed_body.dig("data", "statsForUser", "aggregateSeries")

      expect(series.map { |p| p["capturedOn"] }).to eq(series.map { |p| p["capturedOn"] }.sort)
      expect(series.last).to include("totalHits" => 200, "totalKudos" => 20)
    end

    it "computes a per-point kudos-to-hits ratio" do
      graphql_post(variables: { username: "chartuser", token: "valid_token" })
      series = response.parsed_body.dig("data", "statsForUser", "aggregateSeries")

      expect(series.first["kudosToHitsRatio"]).to be_within(0.001).of(10.0 / 100)
    end

    it "guards against divide-by-zero when total_hits is 0" do
      zero_hits_user = Ao3User.create!(username: "zerohits", read_token: "zero_token")
      Snapshot.create!(
        ao3_user: zero_hits_user, captured_on: Date.current, captured_at: Time.current,
        total_hits: 0, total_kudos: 0, total_comments: 0, total_bookmarks: 0,
        total_subscriptions: 0, total_user_subscriptions: 0, total_word_count: 0, works_count: 0,
      )

      graphql_post(variables: { username: "zerohits", token: "zero_token" })

      expect(response.parsed_body["errors"]).to be_blank
      ratio = response.parsed_body.dig("data", "statsForUser", "aggregateSeries", 0, "kudosToHitsRatio")
      expect(ratio).to eq(0)
    end
  end

  context "with per-work series" do
    it "returns each work's time series" do
      snapshot = create_snapshot(captured_on: Date.current, total_hits: 10, total_kudos: 1)
      work = Work.create!(
        ao3_user: ao3_user, ao3_work_id: 555, title: "Tracked Fic",
        fandoms: "Fandom X", last_seen_on: Date.current,
      )
      WorkStat.create!(
        snapshot: snapshot, work: work, hits: 10, kudos: 1, comments: 0,
        bookmarks: 0, subscriptions: 0, word_count: 100,
      )

      graphql_post(variables: { username: "chartuser", token: "valid_token" })
      per_work = response.parsed_body.dig("data", "statsForUser", "perWorkSeries")
      tracked = per_work.find { |w| w["ao3WorkId"] == 555 }

      expect(tracked).to include("title" => "Tracked Fic", "fandoms" => "Fandom X")
      expect(tracked["points"].first).to include("hits" => 10, "kudos" => 1)
    end
  end

  context "with a missing or invalid token" do
    it "returns a typed GraphQL error, not an exception, for a wrong token" do
      graphql_post(variables: { username: "chartuser", token: "wrong_token" })

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["errors"]).to be_present
      expect(response.parsed_body.dig("data", "statsForUser")).to be_nil
    end

    it "returns a typed GraphQL error for an unknown username" do
      graphql_post(variables: { username: "nosuchuser", token: "anything" })

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["errors"]).to be_present
    end
  end

  describe "CORS" do
    it "allows the app's own frontend origin but rejects AO3's on the same check" do
      process :options, "/graphql", headers: {
        "Origin" => "http://localhost:5173",
        "Access-Control-Request-Method" => "POST"
      }
      allowed_header = response.headers["Access-Control-Allow-Origin"]

      process :options, "/graphql", headers: {
        "Origin" => "https://archiveofourown.org",
        "Access-Control-Request-Method" => "POST"
      }
      rejected_header = response.headers["Access-Control-Allow-Origin"]

      expect(allowed_header).to eq("http://localhost:5173")
      expect(rejected_header).to be_nil
    end
  end
end
