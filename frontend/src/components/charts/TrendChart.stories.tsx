import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { TrendChart } from "./TrendChart";

// Storybook coverage feeds the addon-a11y automated axe scan (already
// configured from Bootstrap) across the chart's default, sparse/irregular,
// and single-point states.
const meta = {
  title: "Charts/TrendChart",
  component: TrendChart,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegularHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
  },
};

export const IrregularSparseHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-03", value: 100 },
      { capturedOn: "2026-01-04", value: 140 },
      { capturedOn: "2026-02-20", value: 300 },
    ],
  },
};

export const SinglePointHistory: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [{ capturedOn: "2026-01-03", value: 100 }],
  },
};

// The most common real-world shape for a first-time capture: one real
// snapshot plus the synthetic earliest-post-year baseline - exercises the
// dashed lead-in segment and both dot colors (ink for the real point, accent
// for the synthetic one) with the minimum possible data.
export const SinglePointWithLeadIn: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [{ capturedOn: "2026-07-30", value: 2203 }],
    leadIn: { capturedOn: "2019-01-01", value: 0 },
  },
};

export const RegularHistoryWithLeadIn: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
    leadIn: { capturedOn: "2019-01-01", value: 0 },
  },
};

// Testing task T12 (docs/plans/chart-synced-data-table.md §10): feeds the
// addon-a11y automated axe scan against the table->chart sync's
// highlighted-column state (D-B: guide line + ringed markers), not just the
// resting default state RegularHistory above already covers. Hovering the
// visible table's date column header is the table->chart direction (§2.3) -
// the more deterministic of the two sync directions to exercise from a
// story (no Recharts mouse-coordinate math involved, unlike the
// chart->table direction - see TrendChart.sync.test.tsx's EXTERNAL-
// UNVERIFIED note on that one). Red today: TrendChart has no column
// headers or ActivePointOverlay yet.
export const HighlightedColumnState: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
      { capturedOn: "2026-01-15", value: 340 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const columnHeader = await canvas.findByRole("columnheader", { name: "2026-01-08" });
    await userEvent.hover(columnHeader);

    await expect(canvasElement.querySelector('[data-testid="active-point-ring"]')).not.toBeNull();
    await expect(
      canvasElement.querySelector('[data-testid="active-point-guide-line"]'),
    ).not.toBeNull();
  },
};

// I8/I9 (docs/plans/date-hierarchy-grouping.md §1/§9): the plan's own
// happy-path hard case - a 2014 estimated-baseline lead-in plus a dense
// July-August 2026 cluster, spanning 2 years/3 months incl. a single-point
// month (Aug) - real-Preview material for DateGroupingOverlay's month
// span/year rule marks and the table's matching 3-tier header, feeding the
// addon-a11y automated scan against this specific shape (not just the
// simpler existing lead-in stories above).
export const DateHierarchyHardCase: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-07-01", value: 130536 },
      { capturedOn: "2026-07-15", value: 130597 },
      { capturedOn: "2026-08-10", value: 130911 },
    ],
    leadIn: { capturedOn: "2014-09-06", value: 0 },
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-testid="date-grouping-overlay"]'),
    ).not.toBeNull();
    const monthLabels = Array.from(
      canvasElement.querySelectorAll('[data-testid="month-span-label"]'),
    ).map((el) => el.textContent);
    expect(monthLabels).toEqual(["Sep", "Jul", "Aug"]);
    expect(canvasElement.querySelectorAll('[data-testid="year-rule-line"]')).toHaveLength(1);

    const canvas = within(canvasElement);
    const table = await canvas.findByRole("table", { name: /total hits/i });
    await expect(within(table).getByRole("columnheader", { name: "2014" })).toBeVisible();
    await expect(within(table).getByRole("columnheader", { name: "2026" })).toBeVisible();
  },
};

// Chart-table-polish-batch items 2/3/5/6/7 (docs/plans/chart-table-polish-
// batch.md §8 T8): a dense (>30-point), large-magnitude history feeds the
// addon-a11y automated axe scan against the batch's combined new states -
// whole-number Y ticks, the taller 75vh wrapper, suppressed day-of-month
// x-ticks, no axis-tick marker, and thinned on-line dots - all at once, on
// the same fixture, the way a real long-history account would actually
// look. Red today: day-of-month ticks aren't suppressed and dots aren't
// thinned yet.
function dailyPoints(count: number, startValue: number) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    return { capturedOn: date.toISOString().slice(0, 10), value: startValue + i * 37 };
  });
}

export const DenseHistoryAboveThirtyPoints: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: dailyPoints(45, 130536),
  },
  play: async ({ canvasElement }) => {
    const dayTickTexts = Array.from(
      canvasElement.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.textContent ?? "");
    await expect(dayTickTexts.every((text) => text === "")).toBe(true);

    const dotCircles = canvasElement.querySelectorAll('.recharts-line-dots circle[r="3.5"]');
    await expect(dotCircles.length).toBeLessThan(45);

    await expect(canvasElement.querySelectorAll(".recharts-xAxis-tick-labels circle")).toHaveLength(
      0,
    );
  },
};

// Review batch regression (2026-09-27, Finding 1): the DateHierarchyHardCase
// story above happened to have well-separated year-label pixel positions for
// its specific data shape - that green Preview was never evidence this class
// of bug was fixed generally (per the adversarial reviewer's own analysis).
// This story reproduces the actual failure mode directly: the later year's
// only point sits at the domain max, i.e. the plot's own right edge - the
// exact shape that overflowed the old fixed `textAnchor="start"` label off
// the right of the canvas. Asserted with REAL Chromium layout
// (getBoundingClientRect on the actually-rendered <text>), not a jsdom
// estimate - this bug was specifically invisible in jsdom, which never lays
// text out at all.
export const YearLabelRightEdgeOverflowRegression: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2024-06-15", value: 100 },
      { capturedOn: "2025-06-15", value: 200 },
    ],
  },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector("svg.recharts-surface");
    await expect(svg).not.toBeNull();
    const svgRect = (svg as SVGSVGElement).getBoundingClientRect();

    const laterLabel = Array.from(
      canvasElement.querySelectorAll('[data-testid="year-label"]'),
    ).find((el) => el.textContent === "2025");
    await expect(laterLabel).not.toBeUndefined();

    const labelRect = (laterLabel as SVGTextElement).getBoundingClientRect();
    // A 1px tolerance for sub-pixel rounding - the real regression this
    // guards was a label rendering many px past the edge, not a rounding
    // sliver.
    await expect(labelRect.right).toBeLessThanOrEqual(svgRect.right + 1);
    await expect(labelRect.left).toBeGreaterThanOrEqual(svgRect.left - 1);
  },
};

// Review batch regression (2026-09-27, Finding 2): a lead-in's synthetic,
// clamped-near-first-real x-position (chartTimeAxis.leadInEpoch) puts its
// own (years-earlier) year label only a few px from the first real year's
// label on screen - near-guaranteed for any multi-year account with a
// lead-in, not a rare edge case. The existing DateHierarchyHardCase story's
// narrow ~2-month real-data domain never exercised this; a wider multi-year
// real span (2020-2026, mirroring the adversarial reviewer's own
// construction) does. Asserted with real Chromium layout, same rationale as
// the story above.
//
// The real guarantee this story checks is "no two rendered year labels ever
// land closer than the module's 8px buffer" - not "the lead-in's label is
// the one that gets dropped" (the algorithm drops whichever of a colliding
// pair is earlier on screen, with no special-case awareness of "is this a
// lead-in"; see the play function below for why this fixture's data happens
// to make the lead-in the one dropped).
export const LeadInYearLabelCollisionRegression: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2000-01-10", value: 100 },
      { capturedOn: "2013-05-01", value: 200 },
      { capturedOn: "2026-08-10", value: 300 },
    ],
    leadIn: { capturedOn: "1990-09-06", value: 0 },
  },
  play: async ({ canvasElement }) => {
    const labels = Array.from(canvasElement.querySelectorAll('[data-testid="year-label"]'));
    await expect(labels.length).toBeGreaterThan(0);

    const rects = labels
      .map((el) => ({ text: el.textContent, rect: (el as SVGTextElement).getBoundingClientRect() }))
      .sort((a, b) => a.rect.left - b.rect.left);
    for (let i = 0; i < rects.length - 1; i += 1) {
      await expect(rects[i + 1].rect.left).toBeGreaterThanOrEqual(rects[i].rect.right - 1);
    }

    // The algorithm has no concept of "lead-in" vs. "real year" - it drops
    // whichever of a colliding adjacent pair is earlier on screen, full
    // stop (see yearLabelPlacement.ts's computeYearLabelPlacements). For a
    // long-history account it will drop a real year's label too, not just
    // the lead-in's, if that real year happens to be the earlier of a
    // colliding pair. This fixture's lead-in (1990) just happens to be the
    // leftmost mark, so it's the one dropped here - that's this specific
    // fixture's shape, not a guarantee the algorithm makes generally.
    const texts = labels.map((el) => el.textContent);
    await expect(texts).toContain("2000");
    await expect(texts).toContain("2013");
    await expect(texts).toContain("2026");
  },
};

// Maintenance fix (2026-09-29, live-Preview finding): the "legend row below
// the chart is about half a text-height too high" report. Root cause -
// DateGroupingOverlay's month/year <text> marks use the SVG default
// (alphabetic) baseline, where `y` is the BASELINE and ink renders mostly
// ABOVE it, while Recharts' own day-tick text is TOP-anchored (`y` is the
// ink's top) - the 2026-09-26 tuning pass (d93d86d) compared raw `y` deltas
// across those two different conventions and believed it had a clear
// ~18-20px gap when the real rendered ink gap was ~0.5px (year label
// crowding the day-tick row) and the month label's descender was landing ON
// its own span line (visibly struck through). Asserted with REAL Chromium
// layout (getBoundingClientRect), same rationale as the two regression
// stories above - this class of bug is invisible in jsdom, which never lays
// text out at all.
export const VerticalBandSpacingRegression: Story = {
  args: {
    title: "Total hits",
    valueLabel: "Hits",
    points: [
      { capturedOn: "2026-07-01", value: 130536 },
      { capturedOn: "2026-07-15", value: 130597 },
      { capturedOn: "2026-08-10", value: 130911 },
    ],
    leadIn: { capturedOn: "2014-09-06", value: 0 },
  },
  play: async ({ canvasElement }) => {
    const monthLabel = canvasElement.querySelector('[data-testid="month-span-label"]');
    const monthLine = canvasElement.querySelector('[data-testid="month-span-line"]');
    const dayTick = Array.from(
      canvasElement.querySelectorAll(".recharts-cartesian-axis-tick-value"),
    ).find((el) => el.textContent === "01");
    const yearLabel = Array.from(canvasElement.querySelectorAll('[data-testid="year-label"]')).find(
      (el) => el.textContent === "2026",
    );
    await expect(monthLabel).not.toBeNull();
    await expect(monthLine).not.toBeNull();
    await expect(dayTick).not.toBeUndefined();
    await expect(yearLabel).not.toBeUndefined();

    const monthLabelRect = (monthLabel as SVGTextElement).getBoundingClientRect();
    const monthLineRect = (monthLine as SVGLineElement).getBoundingClientRect();
    const dayTickRect = (dayTick as SVGTextElement).getBoundingClientRect();
    const yearLabelRect = (yearLabel as SVGTextElement).getBoundingClientRect();

    // The month label's own ink must clear its span line, not overlap it -
    // the exact defect a screenshot caught (the line struck through "Jul").
    await expect(monthLabelRect.bottom).toBeLessThanOrEqual(monthLineRect.top);
    // The year label must sit a REAL gap below the day-tick row, not ~0px -
    // a generous-but-meaningful 10px floor (well short of the intended
    // ~18-20px, so this fails loudly on any regression toward the old
    // baseline-mismatch bug without being pixel-brittle).
    await expect(yearLabelRect.top - dayTickRect.bottom).toBeGreaterThanOrEqual(10);
  },
};
