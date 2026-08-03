import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateRangeSlider } from "./DateRangeSlider";

// Storybook's addon-a11y automated scan is the first line of defense for
// this component's MUI-sourced ARIA slider pattern + the project's own
// accent focus-ring theming (see the plan's "MUI Slider styling" section) -
// requires @mui/material + emotion peers (not yet installed, task 6).
const meta = {
  title: "Components/DateRangeSlider",
  component: DateRangeSlider,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DateRangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // args is required by Storybook's CSF3 types whenever the component has
  // required props, even though this story's own `render` builds its
  // interactive state from local useState rather than reading `args` -
  // kept identical to render's initial values so the Controls panel still
  // shows something sensible.
  args: { min: 2018, max: 2026, value: [2018, 2026], onChange: () => {}, unionPointCount: 8 },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([2018, 2026]);
    return (
      <DateRangeSlider
        min={2018}
        max={2026}
        value={value}
        onChange={setValue}
        unionPointCount={8}
      />
    );
  },
};

export const NarrowedWindow: Story = {
  args: { min: 2014, max: 2026, value: [2020, 2023], onChange: () => {}, unionPointCount: 10 },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([2020, 2023]);
    return (
      <DateRangeSlider
        min={2014}
        max={2026}
        value={value}
        onChange={setValue}
        unionPointCount={10}
      />
    );
  },
};

// Below the >2 union-points gate - renders nothing, per Q5.
export const HiddenBelowGate: Story = {
  args: { min: 2018, max: 2026, value: [2018, 2026], onChange: () => {}, unionPointCount: 2 },
  render: function Render() {
    const [value, setValue] = useState<[number, number]>([2018, 2026]);
    return (
      <DateRangeSlider
        min={2018}
        max={2026}
        value={value}
        onChange={setValue}
        unionPointCount={2}
      />
    );
  },
};
