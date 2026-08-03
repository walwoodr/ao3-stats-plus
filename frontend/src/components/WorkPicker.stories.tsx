import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkPicker } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Storybook coverage feeds the addon-a11y automated axe scan across the
// picker's grouped, multi-fandom, and at-cap states - mirrors the
// component-level scan pattern already established for TrendChart/
// RatioChart's stories.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

const meta = {
  title: "Components/WorkPicker",
  component: WorkPicker,
  parameters: { layout: "padded" },
} satisfies Meta<typeof WorkPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const GROUPED_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, title: "The Long Way Home", fandoms: "Fandom One" }),
  work({ ao3WorkId: 2, title: "Sideways", fandoms: "Fandom One" }),
  work({ ao3WorkId: 3, title: "Crossover Event", fandoms: "Fandom One, Fandom Two" }),
  work({ ao3WorkId: 4, title: "A Study in Scarlet", fandoms: "Fandom Two" }),
  work({ ao3WorkId: 5, title: "Standalone Drabble", fandoms: "" }),
];

export const Default: Story = {
  // args is required by Storybook's CSF3 types whenever the component has
  // required props, even though this story's own `render` builds its
  // interactive state from local useState rather than reading `args`.
  args: { perWorkSeries: GROUPED_WORKS, selectedWorkIds: [], onChange: () => {} },
  render: function Render() {
    const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([]);
    return (
      <WorkPicker
        perWorkSeries={GROUPED_WORKS}
        selectedWorkIds={selectedWorkIds}
        onChange={setSelectedWorkIds}
      />
    );
  },
};

export const WithOneSelected: Story = {
  args: { perWorkSeries: GROUPED_WORKS, selectedWorkIds: [1], onChange: () => {} },
  render: function Render() {
    const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([1]);
    return (
      <WorkPicker
        perWorkSeries={GROUPED_WORKS}
        selectedWorkIds={selectedWorkIds}
        onChange={setSelectedWorkIds}
      />
    );
  },
};

const SEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 7 }, (_, i) =>
  work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
);

export const AtCap: Story = {
  args: { perWorkSeries: SEVEN_WORKS, selectedWorkIds: [1, 2, 3, 4, 5, 6], onChange: () => {} },
  render: function Render() {
    const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([1, 2, 3, 4, 5, 6]);
    return (
      <WorkPicker
        perWorkSeries={SEVEN_WORKS}
        selectedWorkIds={selectedWorkIds}
        onChange={setSelectedWorkIds}
      />
    );
  },
};
