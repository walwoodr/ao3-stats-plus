import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComparisonLegend } from "./ComparisonLegend";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing task 12 (docs/plans/usds-dataviz-color-scheme.md, section 7): a
// dedicated legend story at the full 10-work cap-raise state, feeding the
// Storybook addon-a11y automated axe scan against the worded
// "{colorRole} {shape} marker" description text and its glyphs together -
// no prior ComparisonLegend story file existed.
const meta = {
  title: "Charts/ComparisonLegend",
  component: ComparisonLegend,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ComparisonLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTenSlots: Story = {
  args: {
    entries: Array.from({ length: 10 }, (_, i) => ({
      workId: i + 1,
      title: `Work ${i + 1}`,
      styleIndex: i,
    })),
    seriesColors: LIGHT_COLOR_TOKENS.series,
  },
};

export const TwoWorks: Story = {
  args: {
    entries: [
      { workId: 1, title: "The Long Way Home", styleIndex: 0 },
      { workId: 2, title: "Sideways", styleIndex: 1 },
    ],
    seriesColors: LIGHT_COLOR_TOKENS.series,
  },
};
