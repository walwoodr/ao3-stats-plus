// Shared constants for the bookmarklet's payload/build wiring. Kept in its
// own tiny module so ingestClient.ts and entrypoint.ts agree on the same
// value rather than each hardcoding it.
export const SCHEMA_VERSION = 1;

// Phase 2's own schema-version namespace (plan section 3), independent of
// the stats-page SCHEMA_VERSION above - the two payloads/endpoints can
// version forward separately.
export const WORK_DETAIL_SCHEMA_VERSION = 1;
