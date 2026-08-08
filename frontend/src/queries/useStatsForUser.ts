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
  // totalSubscriptions (per-work subscriptions summed) - already resolved
  // (non-null) by the backend's AggregateSeriesPointType. Kept OPTIONAL
  // here, not required, for the same fixture-churn reason as PerWorkPoint's
  // new fields below - many pre-existing aggregateSeries point literals
  // across the test suite predate this feature.
  totalUserSubscriptions?: number;
}

// Per-work new metrics (docs/plans/additional-metric-trend-charts.md
// §1/§3.1-3.3): comments/bookmarks/subscriptions are always present on the
// backend (non-null PerWorkPointType fields) but kept OPTIONAL here to
// avoid churning every pre-existing point literal across the test suite
// that predates this feature (Testing-stage fixture-churn call, plan §7's
// "Fixture-churn note" - non-blocking) - a missing value is treated the
// same as "no data for this point" at render time, never a crash.
// publicBookmarks/privateBookmarks are genuinely nullable at the backend
// (enrichment hasn't run for every snapshot) - private is null exactly when
// public is null.
export interface PerWorkPoint {
  capturedOn: string;
  hits: number;
  kudos: number;
  comments?: number;
  bookmarks?: number;
  subscriptions?: number;
  publicBookmarks?: number | null;
  privateBookmarks?: number | null;
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
