require "rails_helper"

# POST /ingest/token is the new "edit my token" action (plan section 3c:
# docs/plans/memorable-token-and-recovery.md). Same trust boundary/CORS
# scope as /ingest and /ingest/work (AO3-origin only), same
# rescue-and-render pattern as IngestController's other two actions, backed
# by TokenUpdateService. Always-accept: no current-token proof required,
# and it can never return 403.
RSpec.describe "POST /ingest/token", type: :request do
  let(:ao3_origin) { "https://archiveofourown.org" }

  def post_ingest_token(payload, origin: ao3_origin)
    post "/ingest/token",
      params: payload.to_json,
      headers: { "Content-Type" => "application/json", "Origin" => origin }
  end

  context "with a known username" do
    it "returns 200 with ok: true and the echoed readToken" do
      Ao3User.create!(username: "token_route_user", read_token: "old-token")

      post_ingest_token(valid_token_update_payload(username: "token_route_user", read_token: "new-token"))

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include("ok" => true, "readToken" => "new-token")
    end

    it "persists the new token so it can be read back" do
      Ao3User.create!(username: "token_route_user2", read_token: "old-token")

      post_ingest_token(valid_token_update_payload(username: "token_route_user2", read_token: "new-token"))

      expect(Ao3User.find_by(username: "token_route_user2").read_token).to eq("new-token")
    end

    it "requires no proof of the current token to succeed" do
      Ao3User.create!(username: "token_route_no_proof", read_token: "secret-old-token")

      post_ingest_token(
        valid_token_update_payload(username: "token_route_no_proof", read_token: "brand-new-token"),
      )

      expect(response).to have_http_status(:ok)
    end
  end

  context "with an unknown username" do
    it "returns 422 and creates no user" do
      expect {
        post_ingest_token(valid_token_update_payload(username: "no_such_token_user", read_token: "new-token"))
      }.not_to change(Ao3User, :count)

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  context "with a blank readToken" do
    it "returns 422 and leaves the stored token untouched" do
      Ao3User.create!(username: "token_route_blank", read_token: "old-token")

      post_ingest_token(valid_token_update_payload(username: "token_route_blank", read_token: ""))

      expect(response).to have_http_status(:unprocessable_entity)
      expect(Ao3User.find_by(username: "token_route_blank").read_token).to eq("old-token")
    end
  end

  context "with an unsupported schemaVersion" do
    it "returns 426" do
      Ao3User.create!(username: "token_route_bad_schema", read_token: "old-token")

      post_ingest_token(
        valid_token_update_payload(username: "token_route_bad_schema", read_token: "new-token", schema_version: 0),
      )

      expect(response).to have_http_status(:upgrade_required)
    end
  end

  # Always-accept means there is no proof-of-ownership rejection path left
  # at all - unlike the old TokenMismatch-era /ingest, this action never
  # returns 403.
  context "no 403 path exists" do
    it "never returns 403, even for an unknown username" do
      post_ingest_token(valid_token_update_payload(username: "definitely_unknown", read_token: "anything"))

      expect(response).not_to have_http_status(:forbidden)
    end
  end

  describe "CORS (scoped to AO3's origin only, mirroring POST /ingest and /ingest/work)" do
    it "allows a preflight request from archiveofourown.org" do
      process :options, "/ingest/token", headers: {
        "Origin" => ao3_origin,
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq(ao3_origin)
    end

    it "allows a preflight request from www.archiveofourown.org" do
      process :options, "/ingest/token", headers: {
        "Origin" => "https://www.archiveofourown.org",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("https://www.archiveofourown.org")
    end

    it "rejects an unrelated origin" do
      process :options, "/ingest/token", headers: {
        "Origin" => "https://evil.example.com",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end

    # /ingest/token is AO3-bookmarklet-only, exactly like /ingest and
    # /ingest/work - it must never accept this app's own frontend origin
    # either, even though the "Save token" action is triggered by code
    # running on the AO3 page (not our frontend), so our own dashboard
    # origin has no legitimate reason to call it directly.
    it "rejects this app's own frontend origin" do
      process :options, "/ingest/token", headers: {
        "Origin" => "http://localhost:5173",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end

    it "persists a real POST from AO3 but never reflects an unrelated origin back" do
      Ao3User.create!(username: "token_cors_allowed", read_token: "old-token")
      post_ingest_token(
        valid_token_update_payload(username: "token_cors_allowed", read_token: "new-token"), origin: ao3_origin,
      )
      allowed_header = response.headers["Access-Control-Allow-Origin"]

      post_ingest_token(
        valid_token_update_payload(username: "token_cors_allowed", read_token: "evil-token"),
        origin: "https://evil.example.com",
      )
      rejected_header = response.headers["Access-Control-Allow-Origin"]

      expect(allowed_header).to eq(ao3_origin)
      expect(rejected_header).to be_nil
    end
  end
end
