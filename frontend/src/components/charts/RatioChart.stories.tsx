import type { Meta, StoryObj } from "@storybook/react-vite";
import { RatioChart } from "./RatioChart";

const meta = {
  title: "Charts/RatioChart",
  component: RatioChart,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RatioChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegularHistory: Story = {
  args: {
    title: "Kudos-to-hits ratio",
    points: [
      { capturedOn: "2026-01-01", ratio: 0.08 },
      { capturedOn: "2026-01-08", ratio: 0.1 },
      { capturedOn: "2026-01-15", ratio: 0.12 },
    ],
  },
};

export const IncludesAZeroRatio: Story = {
  args: {
    title: "Kudos-to-hits ratio",
    points: [
      { capturedOn: "2026-01-01", ratio: 0 },
      { capturedOn: "2026-01-08", ratio: 0.1 },
    ],
  },
};

export const SinglePointHistory: Story = {
  args: {
    title: "Kudos-to-hits ratio",
    points: [{ capturedOn: "2026-01-01", ratio: 0.08 }],
  },
};

// Mirrors TrendChart's SinglePointWithLeadIn - the most common real-world
// shape for a first-time capture, exercising the fixed ratio: 0 baseline.
export const SinglePointWithLeadIn: Story = {
  args: {
    title: "Kudos-to-hits ratio",
    points: [{ capturedOn: "2026-07-30", ratio: 0.15 }],
    leadIn: { capturedOn: "2019-01-01", ratio: 0 },
  },
};

// Mirrors TrendChart's RegularHistoryWithLeadIn - exercises the 3+ point
// case, where the lead-in sits the same categorical distance from the first
// real point as the first real point sits from the second.
export const RegularHistoryWithLeadIn: Story = {
  args: {
    title: "Kudos-to-hits ratio",
    points: [
      { capturedOn: "2026-01-01", ratio: 0.08 },
      { capturedOn: "2026-01-08", ratio: 0.1 },
      { capturedOn: "2026-01-15", ratio: 0.12 },
    ],
    leadIn: { capturedOn: "2019-01-01", ratio: 0 },
  },
};
