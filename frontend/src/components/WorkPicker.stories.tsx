import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkPicker } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Storybook coverage feeds the addon-a11y automated axe scan across the
// picker's grouped, multi-fandom, and at-cap states - mirrors the
// component-level scan pattern already established for TrendChart/
// RatioChart's stories.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], bookmarks: [], ...overrides };
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

// Selects the multi-fandom "Crossover Event" work (id 3) up front, so its
// chip and both option-row appearances (one per fandom group, §3) render
// selected from the start - exercises the "toggling any appearance toggles
// the one work, exactly one chip" flattening without requiring an
// interaction step in Storybook's own a11y scan.
export const MultiFandomWorkSelected: Story = {
  args: { perWorkSeries: GROUPED_WORKS, selectedWorkIds: [3], onChange: () => {} },
  render: function Render() {
    const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([3]);
    return (
      <WorkPicker
        perWorkSeries={GROUPED_WORKS}
        selectedWorkIds={selectedWorkIds}
        onChange={setSelectedWorkIds}
      />
    );
  },
};

const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
  work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
);
const TEN_SELECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const AtCap: Story = {
  args: { perWorkSeries: ELEVEN_WORKS, selectedWorkIds: TEN_SELECTED, onChange: () => {} },
  render: function Render() {
    const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>(TEN_SELECTED);
    return (
      <WorkPicker
        perWorkSeries={ELEVEN_WORKS}
        selectedWorkIds={selectedWorkIds}
        onChange={setSelectedWorkIds}
      />
    );
  },
};
