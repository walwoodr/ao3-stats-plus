import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ClientError } from "graphql-request";
import { GraphQLError } from "graphql";
import { BookmarkFeedPage } from "./BookmarkFeedPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useBookmarkFeedStore } from "../store/useBookmarkFeedStore";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import { useStatsForUser } from "../queries/useStatsForUser";

// BookmarkFeedPage mirrors DashboardPage's exact token/loading/error state
// machine (docs/plans/bookmark-notes-feed.md §3, task T-08), then wires the
// (reused, controlled) WorkPicker to the NEW useBookmarkFeedStore instead of
// useWorkComparisonStore - same mocking strategy as DashboardPage.test.tsx
// (useTokenFromUrl/useStatsForUser mocked; the Zustand stores are real,
// reset between tests). The component does not exist yet - every test below
// is expected to fail on import alone.
function makeClientError(message: string): ClientError {
  return new ClientError(
    {
      status: 401,
      headers: new Headers(),
      body: JSON.stringify({ errors: [{ message }] }),
      errors: [new GraphQLError(message)],
    },
    { query: "query StatsForUser" },
  );
}

vi.mock("../store/useTokenFromUrl");
vi.mock("../queries/useStatsForUser");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/u/someauthor/bookmarks"]}>
      <Routes>
        <Route path="/u/:username/bookmarks" element={<BookmarkFeedPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockStats(overrides: Partial<ReturnType<typeof useStatsForUser>>) {
  vi.mocked(useStatsForUser).mockReturnValue({
    data: undefined,
    error: null,
    isLoading: false,
    ...overrides,
  } as ReturnType<typeof useStatsForUser>);
}

const TWO_WORKS_RESPONSE = {
  statsForUser: {
    kudosToHitsRatio: 0.1,
    aggregateSeries: [],
    earliestPostYear: null,
    perWorkSeries: [
      {
        ao3WorkId: 1,
        title: "Work A",
        fandoms: "Fandom One",
        points: [],
        bookmarks: [
          {
            bookmarkerName: "Alice",
            noteHtml: "<p>Loved it</p>",
            bookmarkerTags: [],
            bookmarkedOn: "2026-01-01",
            collections: [],
          },
        ],
      },
      {
        ao3WorkId: 2,
        title: "Work B",
        fandoms: "Fandom Two",
        points: [],
        bookmarks: [
          {
            bookmarkerName: "Bob",
            noteHtml: "<p>Also loved it</p>",
            bookmarkerTags: [],
            bookmarkedOn: "2026-02-01",
            collections: [],
          },
        ],
      },
    ],
  },
};

describe("BookmarkFeedPage", () => {
  beforeEach(() => {
    useTokenStore.setState({ tokensByUsername: {} });
    window.localStorage.removeItem("ao3-stats-plus-bookmark-feed-store");
    window.localStorage.removeItem("ao3-stats-plus-work-comparison-store");
    useBookmarkFeedStore.setState({ byUsername: {} });
    useWorkComparisonStore.setState({ byUsername: {} });
  });

  describe("with no token available", () => {
    it("renders the manual token-entry form", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue(undefined);
      mockStats({ isLoading: false });

      renderPage();

      expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
    });
  });

  describe("while the stats query is loading", () => {
    it("renders a loading status announced to assistive tech", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ isLoading: true });

      renderPage();

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("when the token is invalid/mismatched (backend-confirmed ClientError)", () => {
    it("explains the mismatch and keeps the entry form available", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_wrong");
      mockStats({ error: makeClientError("token mismatch") });

      renderPage();

      expect(
        screen.getAllByText(/doesn't match|invalid token|not authorized/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
    });
  });

  describe("when the stats query fails with a plain network/CORS error", () => {
    it("explains it may be a connectivity/config issue rather than blaming the token", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ error: new TypeError("Failed to fetch") });

      renderPage();

      expect(
        screen.getAllByText(/couldn't reach the server|network or configuration/i).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("populated feed", () => {
    it("renders the page heading naming the username", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(
        screen.getByRole("heading", { name: /someauthor.?s bookmark notes/i }),
      ).toBeInTheDocument();
    });

    it("renders the reused WorkPicker combobox", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(screen.getByRole("combobox", { name: /works to compare/i })).toBeInTheDocument();
    });

    // D1: empty selection (default, first visit) means "show all", with the
    // hint text visible near the picker.
    it("shows bookmarks from all works and the 'no filter' hint when the selection is empty", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(screen.getByText(/no filter.*showing bookmarks from all works/i)).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    // Review-flagged regression (C9/D1, 2026-09-14): C9 says a stale
    // persisted selection is "interpreted downstream as 'no filter - show
    // all works'" - the SAME as a genuinely empty one - once every selected
    // id is reconciled away. That must include the hint text and the
    // visible feed content, not just the pure resolveDisplayedWorks helper -
    // otherwise the picker shows no chips (correct) with no explanation
    // (the hint stays hidden today because it strictly gates on
    // `selectedWorkIds.length === 0`, which is false for a non-empty-but-
    // fully-stale array), a confusing combined UX gap.
    it("shows the 'no filter' hint and all works' bookmarks when the persisted selection is non-empty but fully stale (C9/D1)", () => {
      useBookmarkFeedStore.getState().setSelection("someauthor", [9998, 9999]);
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(screen.getByText(/no filter.*showing bookmarks from all works/i)).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("renders the page footnote disclaimers", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(screen.getByText(/only public bookmarks are shown/i)).toBeInTheDocument();
      expect(screen.getByText(/may be partial for heavily-bookmarked works/i)).toBeInTheDocument();
    });

    // Wiring: selecting a work in the picker narrows the feed AND persists
    // to useBookmarkFeedStore, scoped to this username - not
    // useWorkComparisonStore.
    it("wires WorkPicker selections into useBookmarkFeedStore and narrows the visible feed", async () => {
      const user = userEvent.setup();
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();
      await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
      await user.click(screen.getByRole("option", { name: "Work A" }));

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([1]);
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("keeps the feed's persisted selection independent of useWorkComparisonStore", async () => {
      const user = userEvent.setup();
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();
      await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
      await user.click(screen.getByRole("option", { name: "Work A" }));

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([1]);
      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([]);
    });

    it("restores a previously persisted selection from useBookmarkFeedStore on mount", () => {
      useBookmarkFeedStore.getState().setSelection("someauthor", [2]);
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: TWO_WORKS_RESPONSE });

      renderPage();

      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    // C10: a selection change resets the feed's own pagination back to page
    // 1 - exercised end-to-end through the real page, not just BookmarkFeed
    // in isolation (see BookmarkFeed.pagination.test.tsx for the
    // component-level version of this behavior).
    it("resets the feed to page 1 when the picker selection changes", async () => {
      const user = userEvent.setup();
      const manyBookmarksResponse = {
        statsForUser: {
          kudosToHitsRatio: 0.1,
          aggregateSeries: [],
          earliestPostYear: null,
          perWorkSeries: [
            {
              ao3WorkId: 1,
              title: "Work A",
              fandoms: "Fandom One",
              points: [],
              bookmarks: Array.from({ length: 30 }, (_, i) => ({
                bookmarkerName: `Reader ${i + 1}`,
                noteHtml: "<p>hi</p>",
                bookmarkerTags: [],
                bookmarkedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
                collections: [],
              })),
            },
            {
              ao3WorkId: 2,
              title: "Work B",
              fandoms: "Fandom Two",
              points: [],
              bookmarks: [
                {
                  bookmarkerName: "Bob",
                  noteHtml: "<p>hi</p>",
                  bookmarkerTags: [],
                  bookmarkedOn: "2026-02-01",
                  collections: [],
                },
              ],
            },
          ],
        },
      };
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ data: manyBookmarksResponse });

      renderPage();
      await user.click(screen.getByRole("button", { name: "2" }));
      expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");

      // Narrows to Work A alone (still 30 bookmarks -> still multi-page), so
      // the reset-to-page-1 behavior is observable via a still-visible
      // pagination control, rather than narrowing to a single page where
      // the pagination nav would be hidden entirely (plan's C10 clamp
      // behavior, exercised separately above).
      await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
      await user.click(screen.getByRole("option", { name: "Work A" }));

      expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    });
  });
});
