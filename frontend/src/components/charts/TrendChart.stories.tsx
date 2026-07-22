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
