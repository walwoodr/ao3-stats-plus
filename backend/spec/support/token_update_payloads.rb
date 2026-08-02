# Shared builder for the POST /ingest/token JSON payload shape (plan
# section 3c: docs/plans/memorable-token-and-recovery.md), used by both
# TokenUpdateService specs and the POST /ingest/token request specs, so the
# two stay in sync on the contract this stage is defining - mirrors
# spec/support/ingest_payloads.rb's role for the existing /ingest payload.
module TokenUpdatePayloads
  CURRENT_SCHEMA_VERSION = 1

  def valid_token_update_payload(
    username: "someauthor",
    read_token: "new-desired-token",
    schema_version: CURRENT_SCHEMA_VERSION
  )
    {
      "schemaVersion" => schema_version,
      "username" => username,
      "readToken" => read_token
    }
  end
end

RSpec.configure do |config|
  config.include TokenUpdatePayloads
end
