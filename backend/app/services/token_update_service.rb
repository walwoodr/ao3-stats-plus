# TokenUpdateService is the write path for POST /ingest/token (plan
# section 3c: docs/plans/memorable-token-and-recovery.md's "edit my token"
# action) - a dedicated, minimal endpoint for rotating an existing user's
# read_token, distinct from a full /ingest capture.
#
# Always-accept, matching the ingest paths' decision 2: the edit happens in
# the same page-load, same-origin trusted context as a capture that just
# succeeded, so requiring proof of the *current* token would be
# inconsistent with how the capture that set it in the first place required
# no such proof beyond the AO3-origin CORS boundary. Unlike /ingest, this
# action never creates a user - an unknown username is InvalidPayload.
class TokenUpdateService
  class InvalidPayload < StandardError; end
  class UnsupportedSchemaVersion < StandardError; end

  CURRENT_SCHEMA_VERSION = 1

  Result = Struct.new(:ao3_user, :read_token, keyword_init: true)

  def initialize(payload:)
    @payload = payload
  end

  def call
    validate_payload!
    ao3_user = find_user!
    ao3_user.update!(read_token: read_token)

    Result.new(ao3_user: ao3_user, read_token: ao3_user.read_token)
  end

  private

  attr_reader :payload

  def validate_payload!
    raise InvalidPayload, "username is required" if username.blank?
    raise InvalidPayload, "readToken is required" if read_token.blank?
    raise UnsupportedSchemaVersion, "unsupported schemaVersion" unless payload["schemaVersion"] == CURRENT_SCHEMA_VERSION
  end

  def username
    payload["username"]
  end

  def read_token
    payload["readToken"]
  end

  def find_user!
    ao3_user = Ao3User.find_by(username: username)
    raise InvalidPayload, "unknown username #{username}" unless ao3_user

    ao3_user
  end
end
