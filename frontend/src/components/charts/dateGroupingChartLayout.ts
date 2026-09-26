// Shared vertical-layout constants for the three chart components' XAxis
// band, sized to fit DateGroupingOverlay's month/year rows below the day
// ticks without eating plot height (docs/plans/date-hierarchy-grouping.md
// §5.3). The container height and XAxis height are bumped by the SAME
// amount so the plot rect itself (and therefore every existing
// selectDisplayedTicks/interval={0} tick-machinery pixel) is unchanged -
// the extra room is added entirely below the plot, in the (unclipped)
// axis band DateGroupingOverlay draws into.
// Widened from an initial 36px guess (2026-09-26 real-Preview pass, I9):
// a real Chromium screenshot of the populated dashboard showed the day-tick
// row and the year-label row only ~10px apart baseline-to-baseline - close
// enough to read as touching at normal zoom. 60px gives each of the three
// rows (month span+label, day ticks, year label) comfortable breathing room
// - see DateGroupingOverlay.ts's MONTH_LINE_OFFSET/DAY_TICK_MARGIN/
// YEAR_LABEL_OFFSET, tuned together with this constant.
const EXTRA_BAND_HEIGHT = 60;

export const CHART_CONTAINER_HEIGHT = 240 + EXTRA_BAND_HEIGHT;
export const X_AXIS_BAND_HEIGHT = 30 + EXTRA_BAND_HEIGHT;
// Pushes the day-tick text down (via <XAxis tickMargin>, not by touching
// LeadInXAxisTick.tsx itself) so it prints below DateGroupingOverlay's
// month span/label row instead of colliding with it.
export const DAY_TICK_MARGIN = 22;
