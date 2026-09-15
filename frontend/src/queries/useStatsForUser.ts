import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";
import { graphqlClient } from "../lib/graphqlClient";

// Wraps graphql-request in a TanStack Query hook keyed ["stats", username,
// token] - disabled until a token is available (e.g. before useTokenFromUrl
// resolves one), so DashboardPage's empty state never fires a doomed query.
export interface AggregateSeriesPoint {
  capturedOn: string;
  totalHits: number;
  totalKudos: number;
  kudosToHitsRatio: number;
  // Account-level "Subscribers" metric tab (docs/plans/additional-metric-
  // trend-charts.md §1/§3.0) - people subscribed to the author, NOT
  // totalSubscriptions (per-work subscriptions summed). Required: the query
  // above always selects it and the backend's AggregateSeriesPointType
  // resolves it non-null (TECH_DEBT.md, 2026-08-09 - tightened from
  // optional now that the fixture churn is done; every aggregateSeries
  // point literal across the test suite includes it).
  totalUserSubscriptions: number;
}

// Per-work new metrics (docs/plans/additional-metric-trend-charts.md
// §1/§3.1-3.3): comments/bookmarks/subscriptions are always present on the
// backend (non-null PerWorkPointType fields) and required here to match -
// the query above always selects them, so a value is never actually
// missing at runtime (TECH_DEBT.md, 2026-08-09 - tightened from optional
// now that the fixture churn is done). publicBookmarks/privateBookmarks
// stay genuinely optional+nullable: enrichment hasn't run for every
// snapshot, so those two really can be absent/null at the backend - private
// is null exactly when public is null.
export interface PerWorkPoint {
  capturedOn: string;
  hits: number;
  kudos: number;
  comments: number;
  bookmarks: number;
  subscriptions: number;
  publicBookmarks?: number | null;
  privateBookmarks?: number | null;
}

// A single public bookmark note on a work (docs/plans/bookmark-notes-feed.md
// §2/T-03). All five fields are nullable, matching the backend's `null:
// true` on every field of WorkBookmarkType - the DOM markup this is scraped
// from is EXTERNAL-UNVERIFIED (see scrapeWorkBookmarks.ts), so any field can
// genuinely be missing.
//
// Maintenance fix (2026-09-15): bookmarkerTags/collections are SCALAR,
// ", "-joined strings on the wire (backend/app/graphql/types/
// work_bookmark_type.rb: `field :bookmarker_tags, String, null: true`; the
// ingest service stores `Array(...).join(", ").presence`, which is nil for
// an empty list), NOT lists - the same comma-joined-string wire shape as
// `fandoms` (see groupWorksByFandom.ts's splitFandoms). Previously typed as
// non-nullable `string[]`, which crashed dropEmptyRows on any real "bare"
// bookmark (no note, no own tags, no collection - the common case on AO3):
// bookmarkFeed.ts's flattenWorksToRows now does the split (see
// parseCommaList there), matching this corrected wire type.
export interface WorkBookmark {
  bookmarkerName: string | null;
  noteHtml: string | null;
  bookmarkerTags: string | null;
  bookmarkedOn: string | null;
  collections: string | null;
}

export interface PerWorkSeries {
  ao3WorkId: number;
  title: string;
  fandoms: string;
  points: PerWorkPoint[];
  // Per-work zero-basis dates (docs/plans/per-work-zero-basis-dates.md):
  // the work's own AO3 publish date, when the backend has scraped it -
  // optional so pre-existing test fixtures that predate this field keep
  // compiling; WorkComparisonSection treats a missing/null value the same
  // (fall back to earliestPostYear).
  publishedOn?: string | null;
  // Bookmark notes feed (docs/plans/bookmark-notes-feed.md): the backend
  // resolver (`object.work_bookmarks`) is non-null and always selected by
  // the query below, so this is required (empty array, not undefined, when
  // a work has no public bookmarks or hasn't been enriched yet).
  bookmarks: WorkBookmark[];
}

export interface StatsForUserData {
  statsForUser: {
    kudosToHitsRatio: number;
    aggregateSeries: AggregateSeriesPoint[];
    perWorkSeries: PerWorkSeries[];
    earliestPostYear: number | null;
  };
}

const STATS_FOR_USER_QUERY = gql`
  query StatsForUser($username: String!, $token: String!) {
    statsForUser(username: $username, token: $token) {
      kudosToHitsRatio
      earliestPostYear
      aggregateSeries {
        capturedOn
        totalHits
        totalKudos
        kudosToHitsRatio
        totalUserSubscriptions
      }
      perWorkSeries {
        ao3WorkId
        title
        fandoms
        publishedOn
        bookmarks {
          bookmarkerName
          noteHtml
          bookmarkerTags
          bookmarkedOn
          collections
        }
        points {
          capturedOn
          hits
          kudos
          comments
          bookmarks
          subscriptions
          publicBookmarks
          privateBookmarks
        }
      }
    }
  }
`;

export function useStatsForUser(username: string, token: string | undefined) {
  return useQuery({
    queryKey: ["stats", username, token],
    queryFn: async () =>
      graphqlClient.request<StatsForUserData>(STATS_FOR_USER_QUERY, { username, token }),
    enabled: !!token,
  });
}
