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

export const POPULATED_STATS_RESPONSE = {
  data: {
    statsForUser: {
      kudosToHitsRatio: 0.12,
      aggregateSeries: [
        { capturedOn: "2026-01-01", totalHits: 100, totalKudos: 10, kudosToHitsRatio: 0.1 },
        { capturedOn: "2026-01-08", totalHits: 220, totalKudos: 30, kudosToHitsRatio: 0.136 },
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
            { capturedOn: "2026-01-01", hits: 60, kudos: 5 },
            { capturedOn: "2026-01-08", hits: 120, kudos: 15 },
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
        { capturedOn: "2026-01-01", totalHits: 100, totalKudos: 10, kudosToHitsRatio: 0.1 },
        { capturedOn: "2026-01-08", totalHits: 220, totalKudos: 30, kudosToHitsRatio: 0.136 },
      ],
      // Ten of the eleven works carry an accurate, distinct publishedOn
      // (each before its own first capture) to exercise per-work
      // zero-basis lead-ins across the comparison view; the eleventh
      // (i === 10, past the cap) has no publishedOn and a later first
      // capture, exercising the earliestPostYear-fallback lead-in path
      // instead - see docs/plans/per-work-zero-basis-dates.md.
      perWorkSeries: Array.from({ length: 11 }, (_, i) => ({
        ao3WorkId: 100 + i,
        title: `Comparison Work ${i + 1}`,
        fandoms: "Shared Fandom",
        publishedOn: i === 10 ? null : `2023-${String(i + 1).padStart(2, "0")}-01`,
        points:
          i === 10
            ? [
                { capturedOn: "2024-06-01", hits: 70, kudos: 7 },
                { capturedOn: "2025-01-01", hits: 140, kudos: 14 },
                { capturedOn: "2026-01-01", hits: 210, kudos: 21 },
              ]
            : [
                { capturedOn: "2024-01-01", hits: (i + 1) * 10, kudos: i + 1 },
                { capturedOn: "2025-01-01", hits: (i + 1) * 20, kudos: (i + 1) * 2 },
                { capturedOn: "2026-01-01", hits: (i + 1) * 30, kudos: (i + 1) * 3 },
              ],
      })),
      earliestPostYear: 2024,
    },
  },
};
