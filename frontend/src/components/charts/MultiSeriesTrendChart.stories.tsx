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
export const RaggedHistoryAcrossSixWorks: Story = {
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
