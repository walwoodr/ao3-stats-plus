import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TableOrientationToggle } from "./TableOrientationToggle";

// Testing task 6 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §8): feeds the Storybook addon-a11y automated axe scan
// against the new item 2 orientation toggle in isolation, mirroring
// MetricToggle.stories.tsx's "args-driven `render`, not raw `args`"
// convention - a real toggle needs live orientation/onOrientationChange
// state to demonstrate the pressed-state swap.
const meta = {
  title: "Charts/TableOrientationToggle",
  component: TableOrientationToggle,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TableOrientationToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DatesAcrossDefault: Story = {
  args: {
    orientation: "datesAsColumns",
    onOrientationChange: () => {},
  },
  render: () => {
    function Demo() {
      const [orientation, setOrientation] = useState<"datesAsColumns" | "datesAsRows">(
        "datesAsColumns",
      );
      return (
        <TableOrientationToggle orientation={orientation} onOrientationChange={setOrientation} />
      );
    }
    return <Demo />;
  },
};

export const DatesDownFlipped: Story = {
  args: {
    orientation: "datesAsRows",
    onOrientationChange: () => {},
  },
  render: () => {
    function Demo() {
      const [orientation, setOrientation] = useState<"datesAsColumns" | "datesAsRows">(
        "datesAsRows",
      );
      return (
        <TableOrientationToggle orientation={orientation} onOrientationChange={setOrientation} />
      );
    }
    return <Demo />;
  },
};
