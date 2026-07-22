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
