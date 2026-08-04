import type { Meta, StoryObj } from "@storybook/react-vite";
import { MultiSeriesTrendChart } from "./MultiSeriesTrendChart";

// Storybook coverage feeds the addon-a11y automated axe scan across
// multi-series, ragged-history, single-series, and 0-series empty states -
// mirrors TrendChart.stories.tsx's convention.
const meta = {
  title: "Charts/MultiSeriesTrendChart",
  component: MultiSeriesTrendChart,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MultiSeriesTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoWorksRegularHistory: Story = {
  args: {
    title: "Hits",
    valueLabel: "Hits",
    series: [
      {
        workId: 1,
        title: "The Long Way Home",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-01-01", value: 100 },
          { capturedOn: "2026-01-08", value: 220 },
          { capturedOn: "2026-01-15", value: 340 },
        ],
      },
      {
        workId: 2,
        title: "Sideways",
        styleIndex: 1,
        points: [
          { capturedOn: "2026-01-01", value: 40 },
          { capturedOn: "2026-01-08", value: 90 },
          { capturedOn: "2026-01-15", value: 150 },
        ],
      },
    ],
  },
};

// The common "ragged history" corner case: works added to the comparison at
// different times don't share a start date - later-added works get gaps
// (null in the chart, "—" in the table) for dates before they were added.
// Full 10-work cap-raise state (docs/plans/usds-dataviz-color-scheme.md,
// shape set corrected same-day 2026-08-04) - exercises every one of the 10
// style slots: circle/square/triangle/diamond/triangle-down, each filled
// (styleIndex 0-3, 6) and hollow (styleIndex 4-5, 7-9).
export const RaggedHistoryAcrossTenWorks: Story = {
  args: {
    title: "Hits",
    valueLabel: "Hits",
    series: [
      {
        workId: 1,
        title: "Work One",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-01-01", value: 100 },
          { capturedOn: "2026-01-08", value: 220 },
        ],
      },
      {
        workId: 2,
        title: "Work Two",
        styleIndex: 1,
        points: [{ capturedOn: "2026-01-08", value: 90 }],
      },
      {
        workId: 3,
        title: "Work Three",
        styleIndex: 2,
        points: [
          { capturedOn: "2026-01-01", value: 30 },
          { capturedOn: "2026-01-08", value: 60 },
        ],
      },
      {
        workId: 4,
        title: "Work Four",
        styleIndex: 3,
        points: [{ capturedOn: "2026-01-01", value: 10 }],
      },
      {
        workId: 5,
        title: "Work Five",
        styleIndex: 4,
        points: [
          { capturedOn: "2026-01-01", value: 5 },
          { capturedOn: "2026-01-08", value: 8 },
        ],
      },
      {
        workId: 6,
        title: "Work Six",
        styleIndex: 5,
        points: [{ capturedOn: "2026-01-08", value: 15 }],
      },
      {
        workId: 7,
        title: "Work Seven",
        styleIndex: 6,
        points: [
          { capturedOn: "2026-01-01", value: 45 },
          { capturedOn: "2026-01-08", value: 70 },
        ],
      },
      {
        workId: 8,
        title: "Work Eight",
        styleIndex: 7,
        points: [{ capturedOn: "2026-01-01", value: 12 }],
      },
      {
        workId: 9,
        title: "Work Nine",
        styleIndex: 8,
        points: [
          { capturedOn: "2026-01-01", value: 25 },
          { capturedOn: "2026-01-08", value: 40 },
        ],
      },
      {
        workId: 10,
        title: "Work Ten",
        styleIndex: 9,
        points: [{ capturedOn: "2026-01-08", value: 18 }],
      },
    ],
  },
};

export const SingleWork: Story = {
  args: {
    title: "Hits",
    valueLabel: "Hits",
    series: [
      {
        workId: 1,
        title: "The Long Way Home",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-01-01", value: 100 },
          { capturedOn: "2026-01-08", value: 220 },
        ],
      },
    ],
  },
};

export const NoWorksSelected: Story = {
  args: {
    title: "Hits",
    valueLabel: "Hits",
    series: [],
  },
};

// Testing task 6 (docs/plans/per-work-zero-basis-dates.md, section 7): feeds
// the Storybook addon-a11y automated axe scan against a populated
// zero-basis state - one work with an accurate publishedOn (its own
// distinct dashed lead-in slot), two works sharing the earliestPostYear
// fallback (collapsed onto one shared slot), and one work with no leadIn at
// all (mixed presence, the common real-world shape).
export const WithZeroBasisLeadIns: Story = {
  args: {
    title: "Hits",
    valueLabel: "Hits",
    series: [
      {
        workId: 1,
        title: "The Long Way Home",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-01-01", value: 100 },
          { capturedOn: "2026-01-08", value: 220 },
        ],
        leadIn: { capturedOn: "2020-06-01", label: "Published 2020-06-01" },
      },
      {
        workId: 2,
        title: "Sideways",
        styleIndex: 1,
        points: [{ capturedOn: "2026-01-08", value: 90 }],
        leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
      },
      {
        workId: 3,
        title: "Crossover Event",
        styleIndex: 2,
        points: [{ capturedOn: "2026-01-01", value: 30 }],
        leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
      },
      {
        workId: 4,
        title: "No Baseline Available",
        styleIndex: 3,
        points: [{ capturedOn: "2026-01-01", value: 15 }],
      },
    ],
  },
};
