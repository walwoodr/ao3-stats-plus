import type { Meta, StoryObj } from "@storybook/react-vite";
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
