import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PerWorkSeries, WorkBookmark } from "../queries/useStatsForUser";
import { BookmarkFeed } from "./BookmarkFeed";

// Storybook coverage for the feed-level states docs/plans/bookmark-notes-
// feed.md §3 names explicitly: unfiltered all-works default (no glyph),
// single-work filter (no glyph), a 2-10-work filtered subset (glyph shown,
// Decision D5), the genuinely-empty state, and single-page/multi-page
// pagination - each in light and dark (see BookmarkFeedItem.stories.tsx's
// header comment for this repo's current light/dark story-pairing
// convention and its limits).
const meta = {
  title: "Components/BookmarkFeed",
  component: BookmarkFeed,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BookmarkFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

function bookmark(overrides: Partial<WorkBookmark> = {}): WorkBookmark {
  return {
    bookmarkerName: "reader123",
    noteHtml: "<p>Loved this fic!</p>",
    bookmarkerTags: ["favorite"],
    bookmarkedOn: "2026-01-01",
    collections: [],
    ...overrides,
  };
}

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "Fandom One",
    points: [],
    bookmarks: [bookmark()],
    ...overrides,
  };
}

const THREE_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, title: "The Long Way Home", bookmarks: [bookmark({ bookmarkerName: "Alice" })] }),
  work({ ao3WorkId: 2, title: "Sideways", bookmarks: [bookmark({ bookmarkerName: "Bob", bookmarkedOn: "2026-02-01" })] }),
  work({ ao3WorkId: 3, title: "Crossover Event", bookmarks: [bookmark({ bookmarkerName: "Cara", bookmarkedOn: "2026-03-01" })] }),
];

export const UnfilteredAllWorksLight: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [] },
};

export const UnfilteredAllWorksDark: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [] },
  parameters: { backgrounds: { default: "dark" } },
};

export const SingleWorkFilterLight: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [1] },
};

export const SingleWorkFilterDark: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [1] },
  parameters: { backgrounds: { default: "dark" } },
};

export const FilteredSubsetGlyphShownLight: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [1, 2] },
};

export const FilteredSubsetGlyphShownDark: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [1, 2] },
  parameters: { backgrounds: { default: "dark" } },
};

const NO_BOOKMARKS_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, bookmarks: [] }),
  work({ ao3WorkId: 2, bookmarks: [] }),
];

export const GenuinelyEmptyLight: Story = {
  args: { perWorkSeries: NO_BOOKMARKS_WORKS, selectedWorkIds: [] },
};

export const GenuinelyEmptyDark: Story = {
  args: { perWorkSeries: NO_BOOKMARKS_WORKS, selectedWorkIds: [] },
  parameters: { backgrounds: { default: "dark" } },
};

export const SinglePageLight: Story = {
  args: { perWorkSeries: THREE_WORKS, selectedWorkIds: [] },
};

const MANY_BOOKMARKS_WORK: PerWorkSeries = {
  ao3WorkId: 1,
  title: "A Very Popular Work",
  fandoms: "Fandom One",
  points: [],
  bookmarks: Array.from({ length: 30 }, (_, i) =>
    bookmark({
      bookmarkerName: `Reader ${i + 1}`,
      bookmarkedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    }),
  ),
};

export const MultiPageLight: Story = {
  args: { perWorkSeries: [MANY_BOOKMARKS_WORK], selectedWorkIds: [] },
};

export const MultiPageDark: Story = {
  args: { perWorkSeries: [MANY_BOOKMARKS_WORK], selectedWorkIds: [] },
  parameters: { backgrounds: { default: "dark" } },
};
