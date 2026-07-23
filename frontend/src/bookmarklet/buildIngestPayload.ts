import type { ScrapedData } from "./scrapeStats";

// Translates scrapeStats' ScrapedData into the exact POST /ingest JSON body
// contract defined in backend/spec/support/ingest_payloads.rb - camelCase
// keys, aggregate as its own object, works as an array with fandoms as a
// list (the backend unions/joins them into a comma-separated string).
export interface IngestPayload {
  schemaVersion: number;
  username: string;
  readToken: string | null;
  aggregate: ScrapedData["aggregate"];
  works: ScrapedData["works"];
}

export interface BuildIngestPayloadOptions {
  schemaVersion: number;
  readToken?: string;
}

export function buildIngestPayload(data: ScrapedData, options: BuildIngestPayloadOptions): IngestPayload {
  return {
    schemaVersion: options.schemaVersion,
    username: data.username,
    readToken: options.readToken ?? null,
    aggregate: data.aggregate,
    works: data.works,
  };
}
