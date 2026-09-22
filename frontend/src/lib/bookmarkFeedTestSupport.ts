import type { PerWorkSeries, WorkBookmark } from "../queries/useStatsForUser";
import type { BookmarkFeedRow } from "./bookmarkFeed";

// Shared fixtures/helpers for bookmarkFeed.ts's test suite, split by
// concern into sibling bookmarkFeed.*.test.ts files (CODE_STANDARDS.md's
// 400-line .ts budget - TECH_DEBT.md 2026-09-15 flagged the single
// bookmarkFeed.test.ts this replaces, which had grown to 474 lines).
// Every split file imports from here rather than re-declaring its own
// copies, mirroring fanOutTestSupport.ts/the fanOut.*.test.ts split.

export function bookmark(overrides: Partial<WorkBookmark> = {}): WorkBookmark {
  return {
    bookmarkerName: "reader",
    noteHtml: "<p>Loved it</p>",
    bookmarkerTags: null,
    bookmarkedOn: "2026-01-01",
    collections: null,
    ...overrides,
  };
}

export function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "Fandom One",
    points: [],
    bookmarks: [],
    ...overrides,
  };
}

export function row(overrides: Partial<BookmarkFeedRow> & { workId: number }): BookmarkFeedRow {
  return {
    workTitle: `Work ${overrides.workId}`,
    workFandoms: "",
    bookmarkerName: "reader",
    noteHtml: "<p>hi</p>",
    bookmarkerTags: [],
    bookmarkedOn: "2026-01-01",
    collections: [],
    ao3WorkBookmarksUrl: `https://archiveofourown.org/works/${overrides.workId}/bookmarks`,
    ...overrides,
  };
}
