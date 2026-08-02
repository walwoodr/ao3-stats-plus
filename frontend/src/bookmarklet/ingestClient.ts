import type { IngestPayload } from "./buildIngestPayload";

// Wraps the raw fetch() POST to /ingest and classifies the response into a
// discriminated IngestResult, so entrypoint.ts never has to reason about
// HTTP status codes directly. Status mapping per the plan/backend
// (IngestController): 201/200 -> success, 426 (UnsupportedSchemaVersion) ->
// schemaMismatch, 422 (InvalidPayload) -> invalid, network failure or any
// other/5xx status -> networkError. /ingest is always-accept
// (memorable-token-and-recovery plan section 3a) and can never return 403 -
// a stray one falls through to networkError like any other unexpected
// status.

export type IngestResult =
  | { status: "success"; readToken: string; capturedOn: string; deduped: boolean }
  | { status: "schemaMismatch" }
  | { status: "invalid"; message: string }
  | { status: "networkError" };

interface IngestSuccessBody {
  readToken: string;
  capturedOn: string;
  deduped: boolean;
}

interface IngestErrorBody {
  error: string;
}

export async function postIngest(apiOrigin: string, payload: IngestPayload): Promise<IngestResult> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "networkError" };
  }

  switch (response.status) {
    case 200:
    case 201: {
      const body = (await response.json()) as IngestSuccessBody;
      return {
        status: "success",
        readToken: body.readToken,
        capturedOn: body.capturedOn,
        deduped: body.deduped,
      };
    }
    case 426:
      return { status: "schemaMismatch" };
    case 422: {
      const body = (await response.json()) as IngestErrorBody;
      return { status: "invalid", message: body.error };
    }
    default:
      // Includes 5xx and any other unexpected status - treated the same as
      // a network failure since neither is actionable by the user beyond
      // retrying.
      return { status: "networkError" };
  }
}
