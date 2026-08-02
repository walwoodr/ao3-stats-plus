import type { WorkDetailPayload } from "./buildWorkDetailPayload";

// Wraps the raw fetch() POST to /ingest/work and classifies the response
// into a discriminated WorkDetailIngestResult, mirroring ingestClient.ts's
// role for the existing /ingest endpoint. Status mapping per the plan/
// backend (spec/requests/ingest_work_spec.rb): 200/201 -> success, 426
// (UnsupportedSchemaVersion) -> schemaMismatch, 422 (InvalidPayload) ->
// invalid, 409 (NoSnapshotForToday) -> noSnapshotForToday, network failure
// or any other/5xx status -> networkError. /ingest/work no longer checks
// the token at all (memorable-token-and-recovery plan section 3b) and can
// never return 403 - a stray one falls through to networkError.

export type WorkDetailIngestResult =
  | { status: "success" }
  | { status: "schemaMismatch" }
  | { status: "invalid"; message: string }
  | { status: "noSnapshotForToday" }
  | { status: "networkError" };

interface WorkDetailErrorBody {
  error: string;
}

export async function postWorkDetail(
  apiOrigin: string,
  payload: WorkDetailPayload,
): Promise<WorkDetailIngestResult> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/ingest/work`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "networkError" };
  }

  switch (response.status) {
    case 200:
    case 201:
      return { status: "success" };
    case 426:
      return { status: "schemaMismatch" };
    case 409:
      return { status: "noSnapshotForToday" };
    case 422: {
      const body = (await response.json()) as WorkDetailErrorBody;
      return { status: "invalid", message: body.error };
    }
    default:
      // Includes 5xx and any other unexpected status - treated the same as
      // a network failure since neither is actionable by the user beyond
      // retrying.
      return { status: "networkError" };
  }
}
