# POST /ingest is a dedicated JSON endpoint (not GraphQL) so AO3-origin
# bookmarklet scripts can only ever hit this one narrow action, never
# arbitrary GraphQL. See SnapshotIngestService for the actual write path -
# this controller only translates its result/errors into HTTP.
class IngestController < ApplicationController
  def create
    result = SnapshotIngestService.new(payload: ingest_params).call

    render json: {
      ok: true,
      deduped: result.deduped?,
      readToken: result.read_token,
      capturedOn: result.snapshot.captured_on.iso8601
    }, status: result.deduped? ? :ok : :created
  rescue SnapshotIngestService::InvalidPayload => e
    render json: { ok: false, error: e.message }, status: :unprocessable_entity
  rescue SnapshotIngestService::TokenMismatch => e
    render json: { ok: false, error: e.message }, status: :forbidden
  rescue SnapshotIngestService::UnsupportedSchemaVersion => e
    render json: { ok: false, error: e.message }, status: :upgrade_required
  end

  private

  def ingest_params
    params.to_unsafe_h.except("controller", "action")
  end
end
