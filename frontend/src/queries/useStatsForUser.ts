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
}

export interface PerWorkPoint {
  capturedOn: string;
  hits: number;
  kudos: number;
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
