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
          points: [
            { capturedOn: "2026-01-01", hits: 60, kudos: 5 },
            { capturedOn: "2026-01-08", hits: 120, kudos: 15 },
          ],
        },
      ],
    },
  },
};

export const TOKEN_MISMATCH_RESPONSE = {
  errors: [{ message: "That token does not match this username." }],
};
