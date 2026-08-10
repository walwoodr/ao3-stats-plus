import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkComparisonSection } from "./WorkComparisonSection";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Storybook coverage feeds the addon-a11y automated axe scan across the
// full orchestrated section (picker + slider + legend + two charts) in its
// default, multi-select, and at-cap states.
const meta = {
  title: "Components/WorkComparisonSection",
  component: WorkComparisonSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof WorkComparisonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const GROUPED_WORKS: PerWorkSeries[] = [
  {
    ao3WorkId: 1,
    title: "The Long Way Home",
    fandoms: "Fandom One",
    points: [
      {
        capturedOn: "2018-01-01",
        hits: 100,
        kudos: 10,
        comments: 0,
        bookmarks: 0,
        subscriptions: 0,
      },
      {
        capturedOn: "2020-06-01",
        hits: 400,
        kudos: 55,
        comments: 0,
        bookmarks: 0,
        subscriptions: 0,
      },
      {
        capturedOn: "2026-01-01",
        hits: 900,
        kudos: 120,
        comments: 0,
        bookmarks: 0,
        subscriptions: 0,
      },
    ],
  },
  {
    ao3WorkId: 2,
    title: "Sideways",
    fandoms: "Fandom One",
    points: [
      { capturedOn: "2019-03-01", hits: 40, kudos: 5, comments: 0, bookmarks: 0, subscriptions: 0 },
      {
        capturedOn: "2022-06-01",
        hits: 180,
        kudos: 30,
        comments: 0,
        bookmarks: 0,
        subscriptions: 0,
      },
    ],
  },
  {
    ao3WorkId: 3,
    title: "Crossover Event",
    fandoms: "Fandom One, Fandom Two",
    points: [
      { capturedOn: "2021-01-01", hits: 60, kudos: 8, comments: 0, bookmarks: 0, subscriptions: 0 },
    ],
  },
  {
    ao3WorkId: 4,
    title: "A Study in Scarlet",
    fandoms: "Fandom Two",
    points: [
      { capturedOn: "2020-01-01", hits: 30, kudos: 4, comments: 0, bookmarks: 0, subscriptions: 0 },
      {
        capturedOn: "2026-07-01",
        hits: 500,
        kudos: 70,
        comments: 0,
        bookmarks: 0,
        subscriptions: 0,
      },
    ],
  },
];

export const Default: Story = {
  // Distinct usernames per story - the store persists per-username (plan
  // §2) via localStorage, so sharing one username across stories would let
  // an interaction in one story's selection bleed into another's.
  args: { perWorkSeries: GROUPED_WORKS, earliestPostYear: 2018, username: "story-default" },
};

// 11 works sharing one fandom - one more than the 10-work cap - so a single
// "select all in fandom" click in Storybook's own controls/interaction
// reaches the raised cap and exercises every one of the 10 style slots
// (including the 4 new shapes) at once.
const ELEVEN_WORKS_SAME_FANDOM: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) => ({
  ao3WorkId: i + 1,
  title: `Work ${i + 1}`,
  fandoms: "Big Fandom",
  points: [
    {
      capturedOn: "2024-01-01",
      hits: (i + 1) * 10,
      kudos: i + 1,
      comments: 0,
      bookmarks: 0,
      subscriptions: 0,
    },
    {
      capturedOn: "2026-01-01",
      hits: (i + 1) * 25,
      kudos: (i + 1) * 2,
      comments: 0,
      bookmarks: 0,
      subscriptions: 0,
    },
  ],
}));

export const TenWorkFandomAtCap: Story = {
  args: {
    perWorkSeries: ELEVEN_WORKS_SAME_FANDOM,
    earliestPostYear: 2024,
    username: "story-ten-at-cap",
  },
};

// Refinements plan §3.2: the slider is now ALWAYS rendered, so a <=2
// union-point selection shows it DISABLED (full domain, greyed out) rather
// than omitting it entirely - renamed from the pre-refinements
// "SingleWorkNoSlider" to reflect that.
export const SingleWorkDisabledSlider: Story = {
  args: {
    perWorkSeries: [GROUPED_WORKS[0], GROUPED_WORKS[1]],
    earliestPostYear: 2018,
    username: "story-single-disabled-slider",
  },
};

// docs/plans/additional-metric-trend-charts.md §3.0/§3.4: feeds the new
// Comments/Bookmarks(total)/Subscriptions per-work metric tabs plus the
// Bookmarks By-Type/By-Work sub-views' sparse public/private split - one
// work fully enriched throughout, one work with enrichment only on its
// LATER snapshot (an interior gap, not just a trailing one - the "sparse
// interior gaps" corner case, plan §4.1), one work never enriched at all
// (plan §4.3's "zero enrichment data" case for the By-Work sub-view).
const BOOKMARK_SPLIT_WORKS: PerWorkSeries[] = [
  {
    ao3WorkId: 1,
    title: "The Long Way Home",
    fandoms: "Fandom One",
    publishedOn: "2018-01-01",
    points: [
      {
        capturedOn: "2018-01-01",
        hits: 100,
        kudos: 10,
        comments: 4,
        bookmarks: 12,
        subscriptions: 3,
        publicBookmarks: 9,
        privateBookmarks: 3,
      },
      {
        capturedOn: "2020-06-01",
        hits: 400,
        kudos: 55,
        comments: 20,
        bookmarks: 60,
        subscriptions: 10,
        publicBookmarks: 45,
        privateBookmarks: 15,
      },
      {
        capturedOn: "2026-01-01",
        hits: 900,
        kudos: 120,
        comments: 48,
        bookmarks: 140,
        subscriptions: 22,
        publicBookmarks: 100,
        privateBookmarks: 40,
      },
    ],
  },
  {
    ao3WorkId: 2,
    title: "Sideways",
    fandoms: "Fandom One",
    points: [
      {
        capturedOn: "2019-03-01",
        hits: 40,
        kudos: 5,
        comments: 2,
        bookmarks: 6,
        subscriptions: 1,
        publicBookmarks: null,
        privateBookmarks: null,
      },
      {
        capturedOn: "2022-06-01",
        hits: 180,
        kudos: 30,
        comments: 9,
        bookmarks: 25,
        subscriptions: 4,
        publicBookmarks: 18,
        privateBookmarks: 7,
      },
    ],
  },
  {
    ao3WorkId: 3,
    title: "Crossover Event",
    fandoms: "Fandom One, Fandom Two",
    points: [
      {
        capturedOn: "2021-01-01",
        hits: 60,
        kudos: 8,
        comments: 3,
        bookmarks: 10,
        subscriptions: 2,
        publicBookmarks: null,
        privateBookmarks: null,
      },
    ],
  },
];

export const BookmarksSplitAcrossWorks: Story = {
  args: {
    perWorkSeries: BOOKMARK_SPLIT_WORKS,
    earliestPostYear: 2018,
    username: "story-bookmarks-split",
  },
};
