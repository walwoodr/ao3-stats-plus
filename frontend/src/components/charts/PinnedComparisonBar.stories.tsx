import type { Meta, StoryObj } from "@storybook/react-vite";
import { PinnedComparisonBar } from "./PinnedComparisonBar";

// Testing task 7 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §8): feeds the Storybook addon-a11y automated axe scan
// against the new item 3 pin summary strip in isolation, both with and
// without an active elapsed-time note (item 3<->4).
const meta = {
  title: "Charts/PinnedComparisonBar",
  component: PinnedComparisonBar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PinnedComparisonBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PinnedOnly: Story = {
  args: {
    pinnedLabel: "2026-01-04",
    onClear: () => {},
  },
};

export const PinnedWithElapsedTime: Story = {
  args: {
    pinnedLabel: "2026-01-04",
    elapsedLabel: "42 days later",
    onClear: () => {},
  },
};

export const PinnedAtEstimatedBaselineLeadIn: Story = {
  args: {
    pinnedLabel: "Before 2014 (estimated baseline)",
    elapsedLabel: "612 days later",
    onClear: () => {},
  },
};
