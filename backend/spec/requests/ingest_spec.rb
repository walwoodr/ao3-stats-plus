require "rails_helper"

# POST /ingest is a dedicated JSON endpoint (not GraphQL) so AO3-origin
# scripts can only ever hit this one narrow action, never arbitrary GraphQL.
#
# Per docs/plans/memorable-token-and-recovery.md decision 2: this endpoint
# is always-accept - a client-supplied readToken is stored verbatim (no
# server minting), and a *different* token for an existing username
# succeeds and resets it rather than 403ing. There is no 403 path here any
# more (see the removed "token mismatch" context this file used to have).
RSpec.describe "POST /ingest", type: :request do
  let(:ao3_origin) { "https://archiveofourown.org" }

  def post_ingest(payload, origin: ao3_origin)
    post "/ingest",
      params: payload.to_json,
      headers: { "Content-Type" => "application/json", "Origin" => origin }
  end

  context "with a brand-new username" do
    it "returns 201 with ok, readToken, deduped: false, and capturedOn" do
      post_ingest(valid_ingest_payload(username: "newbie"))

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body).to include("ok" => true, "deduped" => false)
      expect(body["readToken"]).to be_present
      expect(body["capturedOn"]).to eq(Date.current.iso8601)
    end

    it "persists a snapshot for the new user" do
      expect {
        post_ingest(valid_ingest_payload(username: "newbie2"))
      }.to change(Snapshot, :count).by(1)
    end
  end

  context "with an existing username and a matching token" do
    it "returns success and reuses the same user" do
      post_ingest(valid_ingest_payload(username: "returning_ingest"))
      token = response.parsed_body["readToken"]

      expect {
        post_ingest(valid_ingest_payload(username: "returning_ingest", read_token: token))
      }.not_to change(Ao3User, :count)
      expect(response).to have_http_status(:ok).or have_http_status(:created)
    end
  end

  context "on a same-day repeat ingest" do
    it "returns 200 with deduped: true and does not add a snapshot" do
      post_ingest(valid_ingest_payload(username: "repeat_today"))
      token = response.parsed_body["readToken"]

      expect {
        post_ingest(valid_ingest_payload(username: "repeat_today", read_token: token))
      }.not_to change(Snapshot, :count)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to include("deduped" => true)
    end
  end

  context "with a malformed or missing-field payload" do
    it "returns 422 and persists nothing when username is missing" do
      payload = valid_ingest_payload.tap { |p| p.delete("username") }

      expect { post_ingest(payload) }.not_to change(Ao3User, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 422 and persists nothing when aggregate is missing" do
      payload = valid_ingest_payload(username: "malformed_req").tap { |p| p.delete("aggregate") }

      expect { post_ingest(payload) }.not_to change(Snapshot, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end

    # Plan section 3a: the client always supplies a readToken now (the
    # server never mints one), so a missing/blank token is itself
    # malformed, not "let the server generate one".
    it "returns 422 and persists nothing when readToken is missing" do
      payload = valid_ingest_payload(username: "no_token_req", read_token: nil)

      expect { post_ingest(payload) }.not_to change(Ao3User, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 422 and persists nothing when readToken is blank" do
      payload = valid_ingest_payload(username: "blank_token_req", read_token: "   ")

      expect { post_ingest(payload) }.not_to change(Ao3User, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  context "with an unknown or too-old schemaVersion" do
    it "returns 409 or 426 and persists nothing" do
      payload = valid_ingest_payload(username: "old_schema").merge("schemaVersion" => 0)

      expect { post_ingest(payload) }.not_to change(Ao3User, :count)
      expect(response.status).to be_in([ 409, 426 ])
    end
  end

  # Decision 2 (plan section 1/3a): a *different* client-supplied token for
  # an existing username is no longer rejected - it succeeds and resets
  # read_token to the new value. This is the recovery path: re-running the
  # bookmarklet on your own real stats page always re-establishes access,
  # even after losing/forgetting the old token.
  context "with an existing username and a different client token" do
    it "returns success (not 403) and echoes the new token" do
      post_ingest(valid_ingest_payload(username: "resetting_user", read_token: "original_token"))

      post_ingest(valid_ingest_payload(username: "resetting_user", read_token: "new_token"))

      expect(response).to have_http_status(:ok).or have_http_status(:created)
      expect(response.parsed_body["readToken"]).to eq("new_token")
    end

    it "resets the stored read_token so a later request must use the new value" do
      post_ingest(valid_ingest_payload(username: "resetting_user2", read_token: "original_token"))
      post_ingest(valid_ingest_payload(username: "resetting_user2", read_token: "new_token"))

      expect(Ao3User.find_by(username: "resetting_user2").read_token).to eq("new_token")
    end

    it "does not create a second Ao3User" do
      post_ingest(valid_ingest_payload(username: "resetting_user3", read_token: "original_token"))

      expect {
        post_ingest(valid_ingest_payload(username: "resetting_user3", read_token: "new_token"))
      }.not_to change(Ao3User, :count)
    end
  end

  context "with earliestPostYear in the payload" do
    it "accepts and persists it when present and valid" do
      post_ingest(valid_ingest_payload(username: "ingestyear", earliest_post_year: 2015))

      expect(response).to have_http_status(:created)
      expect(Ao3User.find_by(username: "ingestyear").earliest_post_year).to eq(2015)
    end

    it "accepts the ingest and leaves it unset when absent" do
      post_ingest(valid_ingest_payload(username: "ingestnoyear"))

      expect(response).to have_http_status(:created)
      expect(Ao3User.find_by(username: "ingestnoyear").earliest_post_year).to be_nil
    end

    it "accepts the ingest and ignores it when malformed, without rejecting the real ingest" do
      payload = valid_ingest_payload(username: "ingestbadyear").tap { |p| p["earliestPostYear"] = "banana" }
      post_ingest(payload)

      expect(response).to have_http_status(:created)
      expect(Ao3User.find_by(username: "ingestbadyear").earliest_post_year).to be_nil
    end
  end

  describe "CORS" do
    it "allows a preflight request from archiveofourown.org" do
      process :options, "/ingest", headers: {
        "Origin" => ao3_origin,
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq(ao3_origin)
    end

    it "allows a preflight request from www.archiveofourown.org" do
      process :options, "/ingest", headers: {
        "Origin" => "https://www.archiveofourown.org",
        "Access-Control-Request-Method" => "POST"
      }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("https://www.archiveofourown.org")
    end

    it "allows the AO3 origin but rejects an unrelated origin on the same preflight check" do
      process :options, "/ingest", headers: {
        "Origin" => ao3_origin,
        "Access-Control-Request-Method" => "POST"
      }
      allowed_header = response.headers["Access-Control-Allow-Origin"]

      process :options, "/ingest", headers: {
        "Origin" => "https://evil.example.com",
        "Access-Control-Request-Method" => "POST"
      }
      rejected_header = response.headers["Access-Control-Allow-Origin"]

      expect(allowed_header).to eq(ao3_origin)
      expect(rejected_header).to be_nil
    end

    it "persists an ingest from AO3 but never reflects an unrelated origin back" do
      post_ingest(valid_ingest_payload(username: "cors_allowed"), origin: ao3_origin)
      allowed_header = response.headers["Access-Control-Allow-Origin"]

      post_ingest(valid_ingest_payload(username: "cors_rejected"), origin: "https://evil.example.com")
      rejected_header = response.headers["Access-Control-Allow-Origin"]

      expect(allowed_header).to eq(ao3_origin)
      expect(rejected_header).to be_nil
    end
  end
end
