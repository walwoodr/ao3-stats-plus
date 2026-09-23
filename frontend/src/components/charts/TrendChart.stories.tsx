import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { TrendChart } from "./TrendChart";

// Storybook coverage feeds the addon-a11y automated axe scan (already
// configured from Bootstrap) across the chart's default, sparse/irregular,
// and single-point states.
const meta = {
  title: "Charts/TrendChart",
  component: TrendChart,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegularHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
  },
};

export const IrregularSparseHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-03", value: 100 },
      { capturedOn: "2026-01-04", value: 140 },
      { capturedOn: "2026-02-20", value: 300 },
    ],
  },
};

export const SinglePointHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [{ capturedOn: "2026-01-03", value: 100 }],
  },
};

// The most common real-world shape for a first-time capture: one real
// snapshot plus the synthetic earliest-post-year baseline - exercises the
// dashed lead-in segment and both dot colors (ink for the real point, accent
// for the synthetic one) with the minimum possible data.
export const SinglePointWithLeadIn: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [{ capturedOn: "2026-07-30", value: 2203 }],
    leadIn: { capturedOn: "2019-01-01", value: 0 },
  },
};

export const RegularHistoryWithLeadIn: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
    leadIn: { capturedOn: "2019-01-01", value: 0 },
  },
};

// Testing task T12 (docs/plans/chart-synced-data-table.md §10): feeds the
// addon-a11y automated axe scan against the table->chart sync's
// highlighted-column state (D-B: guide line + ringed markers), not just the
// resting default state RegularHistory above already covers. Hovering the
// visible table's date column header is the table->chart direction (§2.3) -
// the more deterministic of the two sync directions to exercise from a
// story (no Recharts mouse-coordinate math involved, unlike the
// chart->table direction - see TrendChart.sync.test.tsx's EXTERNAL-
// UNVERIFIED note on that one). Red today: TrendChart has no column
// headers or ActivePointOverlay yet.
export const HighlightedColumnState: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const columnHeader = await canvas.findByRole("columnheader", { name: "2026-01-08" });
    await userEvent.hover(columnHeader);

    await expect(canvasElement.querySelector('[data-testid="active-point-ring"]')).not.toBeNull();
    await expect(
      canvasElement.querySelector('[data-testid="active-point-guide-line"]'),
    ).not.toBeNull();
  },
};
