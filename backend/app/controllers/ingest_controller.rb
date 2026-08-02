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
  rescue SnapshotIngestService::UnsupportedSchemaVersion => e
    render json: { ok: false, error: e.message }, status: :upgrade_required
  end

  # POST /ingest/work is Phase 2's per-work enrichment sibling action (plan
  # section 3): same "one narrow non-GraphQL action per bookmarklet
  # capability" design and rescue-and-render pattern as #create above, but
  # its own service/error set since it's authorizing/persisting a different
  # payload shape.
  def create_work_detail
    result = WorkDetailIngestService.new(payload: ingest_params).call

    render json: { ok: true, ao3WorkId: result.work.ao3_work_id }, status: :created
  rescue WorkDetailIngestService::InvalidPayload => e
    render json: { ok: false, error: e.message }, status: :unprocessable_entity
  rescue WorkDetailIngestService::UnsupportedSchemaVersion => e
    render json: { ok: false, error: e.message }, status: :upgrade_required
  rescue WorkDetailIngestService::NoSnapshotForToday => e
    render json: { ok: false, error: e.message }, status: :conflict
  end

  # POST /ingest/token is the "edit my token" action (plan section 3c):
  # same rescue-and-render pattern as the two actions above, backed by
  # TokenUpdateService. Always-accept - never returns 403.
  def update_token
    result = TokenUpdateService.new(payload: ingest_params).call

    render json: { ok: true, readToken: result.read_token }, status: :ok
  rescue TokenUpdateService::InvalidPayload => e
    render json: { ok: false, error: e.message }, status: :unprocessable_entity
  rescue TokenUpdateService::UnsupportedSchemaVersion => e
    render json: { ok: false, error: e.message }, status: :upgrade_required
  end

  private

  def ingest_params
    params.to_unsafe_h.except("controller", "action")
  end
end
