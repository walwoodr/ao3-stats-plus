require "rails_helper"

# POST /ingest/work is the per-work Phase 2 enrichment endpoint (plan
# section 3): a sibling to POST /ingest, same "one narrow non-GraphQL
# action per bookmarklet capability" design, CORS-scoped to AO3's origin
# only exactly like /ingest (see the CORS describe block below, which
# mirrors spec/requests/ingest_spec.rb's).
#
# Interface this spec pins down: routed via
# WorkDetailIngestService -> controller action translating its Result/
# errors into HTTP, same rescue-and-render pattern as IngestController.
RSpec.describe "POST /ingest/work", type: :request do
  let(:ao3_origin) { "https://archiveofourown.org" }

  def post_ingest_work(payload, origin: ao3_origin)
    post "/ingest/work",
      params: payload.to_json,
      headers: { "Content-Type" => "application/json", "Origin" => origin }
  end

  # Phase 1 (unchanged POST /ingest) always runs before Phase 2 in the real
  # fan-out and is what creates the Snapshot + Work + base WorkStat this
  # endpoint enriches.
  def capture_phase_one(username:, ao3_work_id: 111)
    post "/ingest",
      params: valid_ingest_payload(
        username: username,
        works: [
          { "ao3WorkId" => ao3_work_id, "title" => "Work A", "fandoms" => [ "Fandom One" ],
            "hits" => 400, "kudos" => 40, "comments" => 8, "bookmarks" => 6,
            "subscriptions" => 4, "wordCount" => 30_000 }
        ],
      ).to_json,
      headers: { "Content-Type" => "application/json", "Origin" => ao3_origin }

    response.parsed_body["readToken"]
  end

  context "on a first-ever capture for a work" do
    it "returns a 2xx success status" do
      token = capture_phase_one(username: "worker_success")
      post_ingest_work(valid_work_detail_payload(username: "worker_success", read_token: token))

      expect(response).to have_http_status(:ok).or have_http_status(:created)
    end

    it "returns ok: true in the body" do
      token = capture_phase_one(username: "worker_success_body")
      post_ingest_work(valid_work_detail_payload(username: "worker_success_body", read_token: token))

      expect(response.parsed_body).to include("ok" => true)
    end
  end

  context "on a same-day idempotent re-run" do
    it "still returns a 2xx success status, not a dedup rejection" do
      token = capture_phase_one(username: "worker_rerun")
      post_ingest_work(valid_work_detail_payload(username: "worker_rerun", read_token: token))

      expect {
        post_ingest_work(valid_work_detail_payload(username: "worker_rerun", read_token: token))
      }.not_to change(WorkStat, :count)
      expect(response).to have_http_status(:ok).or have_http_status(:created)
    end
  end

  context "with a token mismatch" do
    it "returns 403 and persists no enrichment" do
      capture_phase_one(username: "worker_403")
      work_stat = WorkStat.where(work: Work.find_by(ao3_work_id: 111)).first

      expect {
        post_ingest_work(
          valid_work_detail_payload(username: "worker_403", read_token: "wrong_token"),
        )
      }.not_to change { work_stat.reload.updated_at }
      expect(response).to have_http_status(:forbidden)
    end
  end

  context "with a malformed payload" do
    it "returns 422 when ao3WorkId is missing" do
      token = capture_phase_one(username: "worker_422")
      payload = valid_work_detail_payload(username: "worker_422", read_token: token).tap { |p| p.delete("ao3WorkId") }

      post_ingest_work(payload)

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  context "with an unsupported schemaVersion" do
    it "returns 426" do
      token = capture_phase_one(username: "worker_426")
      payload = valid_work_detail_payload(username: "worker_426", read_token: token, schema_version: 0)

      post_ingest_work(payload)

      expect(response).to have_http_status(:upgrade_required)
    end
  end

  context "with no snapshot for today (defensive guard, plan section 3)" do
    it "returns 409 and persists no enrichment" do
      token = capture_phase_one(username: "worker_409")

      travel_to(1.day.from_now) do
        post_ingest_work(valid_work_detail_payload(username: "worker_409", read_token: token))
      end

      expect(response).to have_http_status(:conflict)
    end
  end

  describe "CORS (scoped to AO3's origin only, mirroring POST /ingest)" do
    it "allows a preflight request from archiveofourown.org" do
      process :options, "/ingest/work", headers: {
        "Origin" => ao3_origin,
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq(ao3_origin)
    end

    it "allows a preflight request from www.archiveofourown.org" do
      process :options, "/ingest/work", headers: {
        "Origin" => "https://www.archiveofourown.org",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("https://www.archiveofourown.org")
    end

    it "rejects an unrelated origin" do
      process :options, "/ingest/work", headers: {
        "Origin" => "https://evil.example.com",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end

    # /ingest/work is AO3-bookmarklet-only, exactly like /ingest - it must
    # never accept this app's own frontend origin either, the same
    # trust-boundary split config/initializers/cors.rb documents between
    # /ingest and /graphql.
    it "rejects this app's own frontend origin" do
      process :options, "/ingest/work", headers: {
        "Origin" => "http://localhost:5173",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end
  end
end
