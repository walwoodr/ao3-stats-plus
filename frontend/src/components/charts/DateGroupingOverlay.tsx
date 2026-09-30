import { usePlotArea, useXAxisScale } from "recharts";
import { useChartColors } from "../../lib/useChartColors";
import { buildDateHierarchy, type YearGroup } from "../../lib/dateHierarchy";
import type { DateAxisEntry } from "../../lib/tableOrientation";
import { computeYearLabelPlacements, type RawYearLabelMark } from "../../lib/yearLabelPlacement";

export interface DateGroupingOverlayRow {
  capturedOn: string;
  xEpoch: number;
}

export interface DateGroupingOverlayProps {
  // Every plotted point (incl. the lead-in), independent of which subset
  // `selectDisplayedTicks` sampled as real day ticks - month/year marks must
  // reflect ALL data present, not just the <=6 sampled ticks (plan §0.4).
  rows: DateGroupingOverlayRow[];
}

// Vertical offsets for the axis band below the plot, top -> bottom: month
// span line + abbrev label, (day-number ticks, drawn by Recharts itself via
// dateGroupingChartLayout.ts's DAY_TICK_MARGIN), year labels (plan §5.3).
//
// Maintenance fix (2026-09-29, post-ship Preview finding): the 2026-09-26
// tuning above compared each row's raw SVG `y` coordinate ("baseline-to-
// baseline") and assumed that delta WAS the visible gap. It wasn't. These
// `<text>` elements use the SVG default (alphabetic) baseline - `y` marks
// the BASELINE, and the glyph ink renders mostly ABOVE it (ascent) with a
// little below (descent) - whereas Recharts' own day-tick text
// (LeadInXAxisTick.tsx, via its `verticalAnchor="start"`) is TOP-anchored,
// where `y` marks the ink's TOP. Comparing those two `y` values directly
// silently cancelled out roughly one ascent's worth of the intended gap.
// Measured directly in real Chromium (not jsdom, not guessed) for this
// project's 11px label text: ascent ~10px, descent ~3px (ink height ~13px)
// above/below the baseline `y`. Confirmed the resulting defect two ways:
// (a) the month label's descender space was landing ON the month span line
// (the line visibly struck through the label text), and (b) the year
// label's ascent was landing almost entirely inside the gap meant to
// separate it from the day-tick row above (measured ~0.5px actual
// clearance vs. the ~18-20px the prior tuning pass believed it had
// achieved) - this second one is the "legend row is about half a text-
// height too high" defect reported directly against the live Preview.
// Recomputed baseline-aware (not re-nudged by eye): each offset below now
// accounts for the measured ascent/descent so the actual rendered INK
// clears its neighbor by a real, verified margin. Re-confirmed via real
// Chromium after landing (measured, not assumed): month label clears its
// line by ~5px, the line clears the day-tick row by ~5.5px, and the year
// label clears the day-tick row by ~18.5px (right at the originally-
// intended ~18-20px target) - see TrendChart.stories.tsx's
// VerticalBandSpacingRegression story (real Chromium getBoundingClientRect,
// mirroring the existing YearLabelRightEdgeOverflowRegression precedent).
const MONTH_LINE_OFFSET = 20;
const MONTH_LABEL_OFFSET = 8;
const YEAR_LABEL_OFFSET = 68;

// Additive, independent SVG overlay (plan §0/§5) - a sibling of
// ActivePointOverlay inside each chart's <LineChart>. Reads the same public
// Recharts scale hooks ActivePointOverlay already uses; it never touches
// XAxis tick selection/rendering (selectDisplayedTicks/interval={0}/
// LeadInXAxisTick are all untouched by this component). Every x-position is
// derived from an ACTUAL plotted point's xEpoch (in-domain by construction),
// never a synthesized calendar boundary that could extrapolate off-domain -
// see the plan's §0.2 load-bearing rationale.
export function DateGroupingOverlay({ rows }: DateGroupingOverlayProps) {
  const colors = useChartColors();
  const plotArea = usePlotArea();
  const xScale = useXAxisScale();

  if (!plotArea || !xScale) return null;
  // Rebound to a new const so its narrowed (non-undefined) type is trusted
  // inside `pixelFor` below - TS can't otherwise prove a captured outer
  // variable stays narrowed inside a function declared after the guard.
  const scale = xScale;

  const epochByCapturedOn = new Map<string, number>();
  rows.forEach((row) => {
    if (!epochByCapturedOn.has(row.capturedOn)) epochByCapturedOn.set(row.capturedOn, row.xEpoch);
  });

  const entries: DateAxisEntry[] = rows.map((row) => ({
    dateKey: row.capturedOn,
    label: row.capturedOn,
    isLeadIn: false,
  }));
  const hierarchy: YearGroup[] = buildDateHierarchy(entries);

  const plotMinX = plotArea.x;
  const plotMaxX = plotArea.x + plotArea.width;
  function inBounds(x: number): boolean {
    return x >= plotMinX && x <= plotMaxX;
  }
  function pixelFor(dateKey: string): number | null {
    const epoch = epochByCapturedOn.get(dateKey);
    if (epoch == null) return null;
    const x = scale(epoch);
    return typeof x === "number" ? x : null;
  }

  const monthMarks: { key: string; x1: number; x2: number; label: string }[] = [];
  const yearRuleMarks: { key: string; x: number }[] = [];
  const rawYearLabelMarks: RawYearLabelMark[] = [];

  hierarchy.forEach((yearGroup, yearIndex) => {
    yearGroup.months.forEach((monthGroup) => {
      const firstX = pixelFor(monthGroup.days[0].dateKey);
      const lastX = pixelFor(monthGroup.days[monthGroup.days.length - 1].dateKey);
      // Bounds guard (§5.2): skip a mark whose computed x falls outside the
      // declared plot domain rather than draw it off-canvas - defense
      // against extrapolation for a row whose epoch sits outside the axis'
      // own declared domain.
      if (firstX == null || lastX == null || !inBounds(firstX) || !inBounds(lastX)) return;
      monthMarks.push({
        key: `${yearGroup.year}-${monthGroup.month}`,
        x1: firstX,
        x2: lastX,
        label: monthGroup.monthAbbrev,
      });
    });

    const yearFirstDateKey = yearGroup.months[0]?.days[0]?.dateKey;
    const yearFirstX = yearFirstDateKey ? pixelFor(yearFirstDateKey) : null;
    if (yearFirstX != null && inBounds(yearFirstX)) {
      rawYearLabelMarks.push({ key: yearGroup.year, x: yearFirstX, label: yearGroup.year });
    }

    if (yearIndex > 0) {
      const previousYear = hierarchy[yearIndex - 1];
      const previousMonth = previousYear.months[previousYear.months.length - 1];
      const previousLastDateKey = previousMonth?.days[previousMonth.days.length - 1]?.dateKey;
      const previousLastX = previousLastDateKey ? pixelFor(previousLastDateKey) : null;
      // Midpoint in PIXEL space (not a synthesized calendar-boundary epoch)
      // between the two straddling real points - always in-domain since
      // both endpoints are (plan §0.2).
      if (previousLastX != null && yearFirstX != null) {
        const ruleX = (previousLastX + yearFirstX) / 2;
        if (inBounds(ruleX)) {
          yearRuleMarks.push({ key: yearGroup.year, x: ruleX });
        }
      }
    }
  });

  // Resolves right-edge text overflow and lead-in/first-real-year label
  // collisions (yearLabelPlacement.ts) - rawYearLabelMarks above only
  // carries each label's real in-domain ANCHOR point; this is where that
  // anchor gets turned into a final on-screen text-anchor/position that
  // never renders off-canvas or on top of a neighboring year's label.
  const yearLabelMarks = computeYearLabelPlacements(rawYearLabelMarks, {
    minX: plotMinX,
    maxX: plotMaxX,
  });

  return (
    <g aria-hidden="true" data-testid="date-grouping-overlay">
      {monthMarks.map((mark) => (
        <g key={mark.key}>
          <line
            data-testid="month-span-line"
            x1={mark.x1}
            x2={mark.x2}
            y1={plotArea.y + plotArea.height + MONTH_LINE_OFFSET}
            y2={plotArea.y + plotArea.height + MONTH_LINE_OFFSET}
            stroke={colors.inkSoft}
            strokeWidth={1}
          />
          <text
            data-testid="month-span-label"
            x={(mark.x1 + mark.x2) / 2}
            y={plotArea.y + plotArea.height + MONTH_LINE_OFFSET - MONTH_LABEL_OFFSET}
            textAnchor="middle"
            fill={colors.inkSoft}
            fontFamily="var(--font-mono)"
            fontSize={11}
          >
            {mark.label}
          </text>
        </g>
      ))}
      {yearRuleMarks.map((mark) => (
        <line
          key={mark.key}
          data-testid="year-rule-line"
          x1={mark.x}
          x2={mark.x}
          y1={plotArea.y}
          y2={plotArea.y + plotArea.height}
          stroke={colors.inkSoft}
          strokeDasharray="4 4"
          strokeOpacity={0.5}
        />
      ))}
      {yearLabelMarks.map((mark) => (
        <text
          key={mark.key}
          data-testid="year-label"
          x={mark.x}
          y={plotArea.y + plotArea.height + YEAR_LABEL_OFFSET}
          textAnchor={mark.textAnchor}
          fill={colors.inkSoft}
          fontFamily="var(--font-mono)"
          fontSize={11}
        >
          {mark.label}
        </text>
      ))}
    </g>
  );
}
