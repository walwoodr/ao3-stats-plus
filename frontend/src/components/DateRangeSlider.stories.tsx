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
