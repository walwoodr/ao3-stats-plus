// Shared vertical-layout constants for the three chart components' XAxis
// band, sized to fit DateGroupingOverlay's month/year rows below the day
// ticks without eating plot height (docs/plans/date-hierarchy-grouping.md
// §5.3). The container height and XAxis height are bumped by the SAME
// amount so the plot rect itself (and therefore every existing
// selectDisplayedTicks/interval={0} tick-machinery pixel) is unchanged -
// the extra room is added entirely below the plot, in the (unclipped)
// axis band DateGroupingOverlay draws into.
const EXTRA_BAND_HEIGHT = 36;

export const CHART_CONTAINER_HEIGHT = 240 + EXTRA_BAND_HEIGHT;
export const X_AXIS_BAND_HEIGHT = 30 + EXTRA_BAND_HEIGHT;
// Pushes the day-tick text down (via <XAxis tickMargin>, not by touching
// LeadInXAxisTick.tsx itself) so it prints below DateGroupingOverlay's
// month span/label row instead of colliding with it.
export const DAY_TICK_MARGIN = 18;
