import type { PerWorkPoint } from "../queries/useStatsForUser";

// Per-work metric config (docs/plans/additional-metric-trend-charts.md
// §3.0-§3.4, T-I6): keeps the top-level [Hits|Kudos|Comments|Bookmarks|
// Subscriptions] tablist and the Bookmarks By-Type/By-Work sub-views'
// Total/Public/Private extraction rules declarative and in one place,
// rather than duplicated across WorkComparisonSection.tsx/
// WorkComparisonBookmarksTab.tsx.

export interface PerWorkMetricConfig {
  key: string;
  label: string;
  valueOf: (point: PerWorkPoint) => number | null;
}

// The four top-level metrics that render directly as one MultiSeriesTrend-
// Chart (one line per selected work, zero-basis leadIn applied) - Bookmarks
// is deliberately excluded here since it expands into the By-Type/By-Work
// sub-tabs instead (§3.4) rather than rendering as a plain chart. comments/
// subscriptions are required on PerWorkPoint (TECH_DEBT.md, 2026-08-09) -
// the `?? null` fallback that used to guard the old optional typing is now
// provably dead (the query always selects them) and has been removed.
export const PER_WORK_METRICS: PerWorkMetricConfig[] = [
  { key: "hits", label: "Hits", valueOf: (point) => point.hits },
  { key: "kudos", label: "Kudos", valueOf: (point) => point.kudos },
  { key: "comments", label: "Comments", valueOf: (point) => point.comments },
  { key: "subscriptions", label: "Subscriptions", valueOf: (point) => point.subscriptions },
];

// The full top-level tablist order, WITH Bookmarks in its real position
// between Comments and Subscriptions (plan §3.0).
export const PER_WORK_METRIC_TABS: { key: string; label: string }[] = [
  { key: "hits", label: "Hits" },
  { key: "kudos", label: "Kudos" },
  { key: "comments", label: "Comments" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "subscriptions", label: "Subscriptions" },
];

export type BookmarkTypeKey = "total" | "public" | "private";

export interface BookmarkTypeConfig {
  key: BookmarkTypeKey;
  label: string;
  valueOf: (point: PerWorkPoint) => number | null;
  // Only the always-present Total series gets a zero-basis leadIn - the
  // sparse Public/Private series' first enrichment point isn't the work's
  // first capture (plan §3.3).
  applyLeadIn: boolean;
}

// Shared by both Bookmarks sub-views (§3.3/§3.4): By-Type groups these by
// metric-type (one chart per type, one line per work); By-Work groups them
// by work (one chart per work, one line per type, fixed style slots 0/1/2
// in this exact array order).
export const BOOKMARK_TYPES: BookmarkTypeConfig[] = [
  // bookmarks is required on PerWorkPoint (TECH_DEBT.md, 2026-08-09) - no
  // `?? null` fallback needed for the always-present Total series;
  // publicBookmarks/privateBookmarks below stay genuinely optional+nullable.
  { key: "total", label: "Total", valueOf: (point) => point.bookmarks, applyLeadIn: true },
  {
    key: "public",
    label: "Public",
    valueOf: (point) => point.publicBookmarks ?? null,
    applyLeadIn: false,
  },
  {
    key: "private",
    label: "Private",
    valueOf: (point) => point.privateBookmarks ?? null,
    applyLeadIn: false,
  },
];
