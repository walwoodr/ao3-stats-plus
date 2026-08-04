import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkerGlyph } from "./markerShapes";
import { SERIES_STYLE_SLOTS } from "./seriesStyles";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "./colorTokens";

// Testing task 12 (docs/plans/usds-dataviz-color-scheme.md, section 7): a
// dedicated marker-shapes story showing all 10 glyphs together, feeding the
// Storybook addon-a11y automated axe scan (same pattern as every other
// component story in this repo) against the shape/color palette itself,
// independent of any one component that happens to consume it.
function ShapeGrid({ colors }: { colors: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {SERIES_STYLE_SLOTS.map((slot, index) => (
        <li key={slot.shape} className="flex flex-col items-center gap-1 text-xs">
          <MarkerGlyph shape={slot.shape} color={colors[index]} size={5} />
          <span>{slot.shape}</span>
          <span>{slot.colorRole}</span>
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Charts/MarkerShapes",
  component: ShapeGrid,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShapeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTenShapesLight: Story = {
  args: { colors: LIGHT_COLOR_TOKENS.series },
};

export const AllTenShapesDark: Story = {
  args: { colors: DARK_COLOR_TOKENS.series },
  parameters: { backgrounds: { default: "dark" } },
};
