// Wraps the raw fetch() POST to /ingest/token and classifies the response
// into a discriminated TokenUpdateResult, mirroring ingestClient.ts's role
// for the existing /ingest endpoint. Status mapping per the plan
// (docs/plans/memorable-token-and-recovery.md section 3c) and the backend
// (spec/requests/ingest_token_spec.rb): 200 -> success, 426
// (UnsupportedSchemaVersion) -> schemaMismatch, 422 (InvalidPayload) ->
// invalid, network failure or any other/5xx status (including a stray 403,
// which should never legitimately happen under always-accept) ->
// networkError.

export interface TokenUpdatePayload {
  schemaVersion: number;
  username: string;
  readToken: string;
}

export type TokenUpdateResult =
  | { status: "success"; readToken: string }
  | { status: "schemaMismatch" }
  | { status: "invalid"; message: string }
  | { status: "networkError" };

interface TokenUpdateSuccessBody {
  readToken: string;
}

interface TokenUpdateErrorBody {
  error: string;
}

export async function postTokenUpdate(
  apiOrigin: string,
  payload: TokenUpdatePayload,
): Promise<TokenUpdateResult> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/ingest/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "networkError" };
  }

  switch (response.status) {
    case 200: {
      const body = (await response.json()) as TokenUpdateSuccessBody;
      return { status: "success", readToken: body.readToken };
    }
    case 426:
      return { status: "schemaMismatch" };
    case 422: {
      const body = (await response.json()) as TokenUpdateErrorBody;
      return { status: "invalid", message: body.error };
    }
    default:
      // Includes 5xx, a stray 403 (should never happen - always-accept),
      // and any other unexpected status - treated the same as a network
      // failure since none is actionable by the user beyond retrying.
      return { status: "networkError" };
  }
}
