require "rails_helper"

# TokenUpdateService is the write path for POST /ingest/token (plan
# section 3c: docs/plans/memorable-token-and-recovery.md's "edit my token"
# action). It is always-accept, matching the ingest paths' decision 2: the
# edit happens in the same page-load, same-origin trusted context as a
# capture that just succeeded, so requiring proof of the *current* token
# would be inconsistent with how the capture that set it in the first place
# required no such proof beyond the AO3-origin CORS boundary.
#
# Interface this spec pins down (plan section 3c, Q3):
#   TokenUpdateService.new(payload: <Hash>).call
#     => Result#ao3_user, #read_token
#   raises TokenUpdateService::InvalidPayload on a missing/unknown username
#     or a missing/blank readToken.
#   raises TokenUpdateService::UnsupportedSchemaVersion on an unsupported
#     schemaVersion.
#   No TokenMismatch/403 path exists at all - there is no current-token
#     proof requirement.
RSpec.describe TokenUpdateService do
  describe "#call for a known username" do
    it "sets read_token to the client-supplied value with no current-token proof required" do
      Ao3User.create!(username: "rotate_me", read_token: "old-token")

      described_class.new(
        payload: valid_token_update_payload(username: "rotate_me", read_token: "new-token"),
      ).call

      expect(Ao3User.find_by(username: "rotate_me").read_token).to eq("new-token")
    end

    it "returns a Result exposing ao3_user and the newly stored read_token" do
      ao3_user = Ao3User.create!(username: "rotate_result", read_token: "old-token")

      result = described_class.new(
        payload: valid_token_update_payload(username: "rotate_result", read_token: "new-token"),
      ).call

      expect(result.ao3_user).to eq(ao3_user)
      expect(result.read_token).to eq("new-token")
    end

    it "accepts a rotation even though the payload carries no proof of the old token" do
      Ao3User.create!(username: "no_proof_needed", read_token: "secret-old-token")

      expect {
        described_class.new(
          payload: valid_token_update_payload(username: "no_proof_needed", read_token: "brand-new-token"),
        ).call
      }.not_to raise_error
    end

    it "does not create a new Ao3User row (this is an update, not an ingest)" do
      Ao3User.create!(username: "no_new_row", read_token: "old-token")

      expect {
        described_class.new(
          payload: valid_token_update_payload(username: "no_new_row", read_token: "new-token"),
        ).call
      }.not_to change(Ao3User, :count)
    end

    it "persists a no-op update when the client resubmits the same token" do
      Ao3User.create!(username: "resubmit_same", read_token: "steady-token")

      result = described_class.new(
        payload: valid_token_update_payload(username: "resubmit_same", read_token: "steady-token"),
      ).call

      expect(result.read_token).to eq("steady-token")
      expect(Ao3User.find_by(username: "resubmit_same").read_token).to eq("steady-token")
    end
  end

  describe "#call for an unknown username" do
    it "raises InvalidPayload" do
      expect {
        described_class.new(
          payload: valid_token_update_payload(username: "no_such_user", read_token: "new-token"),
        ).call
      }.to raise_error(TokenUpdateService::InvalidPayload)
    end

    it "creates no Ao3User row (unlike /ingest, this endpoint never creates a user)" do
      expect {
        begin
          described_class.new(
            payload: valid_token_update_payload(username: "still_no_such_user", read_token: "new-token"),
          ).call
        rescue TokenUpdateService::InvalidPayload
          nil
        end
      }.not_to change(Ao3User, :count)
    end
  end

  describe "#call with a missing username" do
    it "raises InvalidPayload" do
      payload = valid_token_update_payload.tap { |p| p.delete("username") }

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(TokenUpdateService::InvalidPayload)
    end
  end

  describe "#call with a missing or blank readToken" do
    it "raises InvalidPayload when readToken is missing from the payload entirely (nil)" do
      Ao3User.create!(username: "blank_token_target", read_token: "old-token")
      payload = valid_token_update_payload(username: "blank_token_target", read_token: nil)

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(TokenUpdateService::InvalidPayload)
    end

    it "raises InvalidPayload when readToken is an empty string" do
      Ao3User.create!(username: "empty_token_target", read_token: "old-token")
      payload = valid_token_update_payload(username: "empty_token_target", read_token: "")

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(TokenUpdateService::InvalidPayload)
    end

    it "raises InvalidPayload when readToken is only whitespace" do
      Ao3User.create!(username: "whitespace_token_target", read_token: "old-token")
      payload = valid_token_update_payload(username: "whitespace_token_target", read_token: "   ")

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(TokenUpdateService::InvalidPayload)
    end

    it "leaves the stored read_token untouched when the update is rejected" do
      Ao3User.create!(username: "unchanged_on_reject", read_token: "old-token")
      payload = valid_token_update_payload(username: "unchanged_on_reject", read_token: "")

      begin
        described_class.new(payload: payload).call
      rescue TokenUpdateService::InvalidPayload
        nil
      end

      expect(Ao3User.find_by(username: "unchanged_on_reject").read_token).to eq("old-token")
    end
  end

  describe "#call with an unsupported schemaVersion" do
    it "raises UnsupportedSchemaVersion" do
      Ao3User.create!(username: "bad_schema_target", read_token: "old-token")
      payload = valid_token_update_payload(username: "bad_schema_target", read_token: "new-token", schema_version: 0)

      expect {
        described_class.new(payload: payload).call
      }.to raise_error(TokenUpdateService::UnsupportedSchemaVersion)
    end

    it "does not update the stored read_token" do
      Ao3User.create!(username: "bad_schema_no_write", read_token: "old-token")
      payload = valid_token_update_payload(
        username: "bad_schema_no_write", read_token: "new-token", schema_version: 0,
      )

      begin
        described_class.new(payload: payload).call
      rescue TokenUpdateService::UnsupportedSchemaVersion
        nil
      end

      expect(Ao3User.find_by(username: "bad_schema_no_write").read_token).to eq("old-token")
    end
  end
end
