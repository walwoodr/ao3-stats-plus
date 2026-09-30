import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateRangeSlider } from "./DateRangeSlider";

// Storybook's addon-a11y automated scan is the first line of defense for
// this component's MUI-sourced ARIA slider pattern + the project's own
// accent focus-ring theming (see the plan's "MUI Slider styling" section).
//
// docs/plans/date-range-slider-month-granularity.md D1: the slider's domain
// is now month indices (`year * 12 + (month - 1)`), not raw years - `mi()`
// below duplicates lib/monthIndex.ts's own encoding so these example values
// read as recognizable calendar spans rather than opaque large integers.
function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

const meta = {
  title: "Components/DateRangeSlider",
  component: DateRangeSlider,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DateRangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

const MIN = mi(2018, 1);
const MAX = mi(2026, 12);

export const Default: Story = {
  // args is required by Storybook's CSF3 types whenever the component has
  // required props, even though this story's own `render` builds its
  // interactive state from local useState rather than reading `args` -
  // kept identical to render's initial values so the Controls panel still
  // shows something sensible.
  args: { min: MIN, max: MAX, value: [MIN, MAX], onChange: () => {}, unionPointCount: 8 },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([MIN, MAX]);
    return <DateRangeSlider min={MIN} max={MAX} value={value} onChange={setValue} unionPointCount={8} />;
  },
};

export const NarrowedWindow: Story = {
  args: {
    min: mi(2014, 1),
    max: MAX,
    value: [mi(2020, 1), mi(2023, 6)],
    onChange: () => {},
    unionPointCount: 10,
  },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([mi(2020, 1), mi(2023, 6)]);
    return (
      <DateRangeSlider
        min={mi(2014, 1)}
        max={MAX}
        value={value}
        onChange={setValue}
        unionPointCount={10}
      />
    );
  },
};

// Below the >2 union-points gate - the control is disabled, not omitted
// (docs/plans/work-comparison-picker-refinements.md §3.2).
export const HiddenBelowGate: Story = {
  args: { min: MIN, max: MAX, value: [MIN, MAX], onChange: () => {}, unionPointCount: 2 },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([MIN, MAX]);
    return <DateRangeSlider min={MIN} max={MAX} value={value} onChange={setValue} unionPointCount={2} />;
  },
};
