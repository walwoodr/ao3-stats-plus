import type { Page } from "@playwright/test";

// Shared helper for mocking the /graphql endpoint in e2e specs. The
// frontend-e2e CI job runs no backend service (see .github/workflows/ci.yml)
// so "seeded" snapshot history here means a mocked network response, not a
// real seeded Postgres database.
export async function mockStatsForUser(
  page: Page,
  body: { data?: unknown; errors?: Array<{ message: string }> },
) {
  await page.route("**/graphql", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

// docs/plans/additional-metric-trend-charts.md: aggregateSeries points now
// also carry totalUserSubscriptions (account-level "Subscribers" metric
// tab); perWorkSeries points carry comments/bookmarks/subscriptions
// (always-present) plus publicBookmarks/privateBookmarks (sparse -
// enrichment ran for both captured snapshots here, so the By-Type/By-Work
// bookmark views have real data to render in these e2e fixtures, not just
// gaps).
export const POPULATED_STATS_RESPONSE = {
  data: {
    statsForUser: {
      kudosToHitsRatio: 0.12,
      aggregateSeries: [
        {
          capturedOn: "2026-01-01",
          totalHits: 100,
          totalKudos: 10,
          kudosToHitsRatio: 0.1,
          totalUserSubscriptions: 8,
        },
        {
          capturedOn: "2026-01-08",
          totalHits: 220,
          totalKudos: 30,
          kudosToHitsRatio: 0.136,
          totalUserSubscriptions: 12,
        },
      ],
      perWorkSeries: [
        {
          ao3WorkId: 111,
          title: "Work A",
          fandoms: "Fandom One",
          // Before its first capture (2026-01-01) - exercises the
          // per-work zero-basis lead-in + visible caption in the default
          // single-work populated dashboard state (see
          // docs/plans/per-work-zero-basis-dates.md).
          publishedOn: "2025-06-01",
          points: [
            {
              capturedOn: "2026-01-01",
              hits: 60,
              kudos: 5,
              comments: 2,
              bookmarks: 4,
              subscriptions: 1,
              publicBookmarks: 3,
              privateBookmarks: 1,
            },
            {
              capturedOn: "2026-01-08",
              hits: 120,
              kudos: 15,
              comments: 5,
              bookmarks: 9,
              subscriptions: 2,
              publicBookmarks: 6,
              privateBookmarks: 3,
            },
          ],
        },
      ],
      earliestPostYear: 2025,
    },
  },
};

export const TOKEN_MISMATCH_RESPONSE = {
  errors: [{ message: "That token does not match this username." }],
};

// Synthetic fixture data for the bookmark notes feed
// (docs/plans/bookmark-notes-feed.md, task T-10) - not tied to any external
// system, so no EXTERNAL-UNVERIFIED tag applies here (contrast the
// scrapeWorkBookmarks.ts fixtures, which DO model unverified live-AO3
// markup). "Popular Work" carries 30 bookmarks (one with an adversarial
// XSS payload note) so the default all-works view is genuinely multi-page;
// "Quiet Work" and "Empty Work" exist to exercise a 2-work filter (glyphs
// shown, Decision D5) and the genuinely-empty state (a single-work filter
// with zero bookmarks) respectively.
function syntheticBookmark(overrides: {
  bookmarkerName: string;
  bookmarkedOn: string;
  noteHtml?: string | null;
}) {
  return {
    bookmarkerName: overrides.bookmarkerName,
    noteHtml: overrides.noteHtml ?? "<p>Loved this fic!</p>",
    bookmarkerTags: ["favorite"],
    bookmarkedOn: overrides.bookmarkedOn,
    collections: [],
  };
}

export const BOOKMARK_FEED_STATS_RESPONSE = {
  data: {
    statsForUser: {
      kudosToHitsRatio: 0.12,
      aggregateSeries: [],
      perWorkSeries: [
        {
          ao3WorkId: 201,
          title: "Popular Work",
          fandoms: "Fandom One",
          publishedOn: null,
          points: [],
          bookmarks: Array.from({ length: 30 }, (_, i) =>
            syntheticBookmark({
              bookmarkerName: `Reader ${i + 1}`,
              // The XSS-payload row (i === 0) gets a date newer than every
              // other row across all three works (see below), so it's
              // guaranteed to sort onto page 1 of the default, unfiltered
              // newest-first feed without any pagination - required by
              // T-10's "does not execute" e2e check, which asserts
              // visibility without navigating.
              bookmarkedOn:
                i === 0 ? "2026-03-15" : `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
              // A seeded XSS payload on one row, per T-10's "a seeded XSS
              // payload does not execute (no dialog/altered DOM)" e2e check.
              noteHtml:
                i === 0
                  ? '<p>Nice fic!</p><script>window.__xss = true;</script><img src="x" onerror="window.__xss = true;">'
                  : undefined,
            }),
          ),
        },
        {
          ao3WorkId: 202,
          title: "Quiet Work",
          fandoms: "Fandom Two",
          publishedOn: null,
          points: [],
          bookmarks: [
            syntheticBookmark({ bookmarkerName: "Reader Q", bookmarkedOn: "2026-02-01" }),
          ],
        },
        {
          ao3WorkId: 203,
          title: "Empty Work",
          fandoms: "Fandom Three",
          publishedOn: null,
          points: [],
          bookmarks: [],
        },
      ],
      earliestPostYear: 2025,
    },
  },
};

// EXTERNAL-UNVERIFIED: not tied to any external system - this is purely
// synthetic fixture data for the per-work comparison feature
// (WorkComparisonSection). Eleven works sharing one fandom, one more than
// the 10-work cap (docs/plans/usds-dataviz-color-scheme.md), so a single
// "select all in fandom" click reaches the cap and exercises every one of
// the 10 style slots (including the 4 new shapes); each work has 3+
// distinct capturedOn dates so the union across even 2 selected works
// clears the DateRangeSlider's ">2" visibility gate.
export const MULTI_WORK_STATS_RESPONSE = {
  data: {
    statsForUser: {
      kudosToHitsRatio: 0.12,
      aggregateSeries: [
        {
          capturedOn: "2026-01-01",
          totalHits: 100,
          totalKudos: 10,
          kudosToHitsRatio: 0.1,
          totalUserSubscriptions: 5,
        },
        {
          capturedOn: "2026-01-08",
          totalHits: 220,
          totalKudos: 30,
          kudosToHitsRatio: 0.136,
          totalUserSubscriptions: 9,
        },
      ],
      // Ten of the eleven works carry an accurate, distinct publishedOn
      // (each before its own first capture) to exercise per-work
      // zero-basis lead-ins across the comparison view; the eleventh
      // (i === 10, past the cap) has no publishedOn and a later first
      // capture, exercising the earliestPostYear-fallback lead-in path
      // instead - see docs/plans/per-work-zero-basis-dates.md. Every point
      // also carries the new comments/bookmarks/subscriptions fields plus a
      // publicBookmarks/privateBookmarks split - only on even-indexed works
      // (i % 2 === 0), so the fixture also exercises the sparse "some works
      // have no bookmark-type enrichment at all" corner case (plan §4.3).
      perWorkSeries: Array.from({ length: 11 }, (_, i) => {
        const hasBookmarkSplit = i % 2 === 0;
        const withMetrics = (hits: number, kudos: number, capturedOn: string) => ({
          capturedOn,
          hits,
          kudos,
          comments: Math.round(kudos / 2),
          bookmarks: Math.round(hits / 10),
          subscriptions: Math.round(kudos / 3),
          publicBookmarks: hasBookmarkSplit ? Math.round(hits / 15) : null,
          privateBookmarks: hasBookmarkSplit ? Math.round(hits / 30) : null,
        });

        return {
          ao3WorkId: 100 + i,
          title: `Comparison Work ${i + 1}`,
          fandoms: "Shared Fandom",
          publishedOn: i === 10 ? null : `2023-${String(i + 1).padStart(2, "0")}-01`,
          points:
            i === 10
              ? [
                  withMetrics(70, 7, "2024-06-01"),
                  withMetrics(140, 14, "2025-01-01"),
                  withMetrics(210, 21, "2026-01-01"),
                ]
              : [
                  withMetrics((i + 1) * 10, i + 1, "2024-01-01"),
                  withMetrics((i + 1) * 20, (i + 1) * 2, "2025-01-01"),
                  withMetrics((i + 1) * 30, (i + 1) * 3, "2026-01-01"),
                ],
        };
      }),
      earliestPostYear: 2024,
    },
  },
};
