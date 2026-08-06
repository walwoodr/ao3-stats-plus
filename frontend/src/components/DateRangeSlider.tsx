import { useState } from "react";
import Slider from "@mui/material/Slider";
import { useChartColors } from "../lib/useChartColors";

export interface DateRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  unionPointCount: number;
}

// Converts a `#rrggbb` hex into an rgba() string at the given alpha - MUI's
// `sx` prop needs a real color value (it can't take CSS `color-mix()` the
// way index.css's own focus-ring token does), so this approximates
// MASTER.md's `.input` focus treatment (`color-mix(in srgb, var(--color-
// accent) 15%, transparent)`) against the MUI Slider's own white/transparent
// default - see the plan's "MUI Slider styling" section.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getAriaLabel(index: number): string {
  return index === 0 ? "Range start (year)" : "Range end (year)";
}

function getAriaValueText(value: number): string {
  return String(value);
}

// Thin wrapper around MUI `Slider` in range mode (decision B, resolved by
// the user - see the plan's "Resolved design decisions"). Its own domain
// bound (`min`/`max`, the plan's `[earliestPostYear .. current year]`) is
// separate from the chart's categorical (index) axis - this only filters
// which real points are in the window, per the plan's Q5 reconciliation.
// Rendered only when the `>2` union-points gate (also Q5) passes, so the
// gate lives here rather than being duplicated by every caller.
export function DateRangeSlider({
  min,
  max,
  value,
  onChange,
  unionPointCount,
}: DateRangeSliderProps) {
  const colors = useChartColors();

  // Splits MUI Slider's own continuous `onChange` (fires on every pixel of
  // a drag - cheap, local-only, keeps the thumb/readout visually live)
  // from `onChangeCommitted` (fires once - on drag release, a completed
  // keyboard step, or a plain rail click - verified directly against the
  // installed MUI source, node_modules/@mui/material/Slider/useSlider.js),
  // which is what actually invokes the `onChange` PROP this component
  // receives. That prop drives the parent's store write and therefore a
  // full WorkComparisonSection + both MultiSeriesTrendChart re-render - the
  // original wiring ran that on EVERY intermediate drag position instead of
  // once at the end, a real perf/architecture bug found live in the app
  // (see DateRangeSlider.test.tsx's regression tests for the full
  // writeup, including a Playwright/CDP input-synthesis artifact that was
  // investigated and ruled out as a separate, unrelated concern).
  const [liveValue, setLiveValue] = useState(value);

  // Reconciles local live-drag state with the external value whenever it
  // changes for a reason OTHER than this component's own commit - e.g. a
  // different work selection shifting the domain/clamped range. Adjusts
  // state during render (comparing by VALUE, not array reference - the
  // parent recomputes a fresh `value` array on every one of its own
  // renders regardless of whether the numbers actually changed) rather
  // than in a useEffect, matching this project's established "you might
  // not need an effect" convention (see WorkComparisonSection.tsx's
  // identical rationale for its own range/selection state).
  const [committedValue, setCommittedValue] = useState(value);
  if (value[0] !== committedValue[0] || value[1] !== committedValue[1]) {
    setCommittedValue(value);
    setLiveValue(value);
  }

  if (unionPointCount <= 2) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Visible heading for sighted users - deliberately NOT wired via
          aria-labelledby: MUI applies aria-labelledby identically to both
          thumbs' hidden inputs, and per the accessible-name computation
          order aria-labelledby wins over aria-label, which would clobber
          each thumb's own getAriaLabel-derived "Range start/end (year)"
          name with this shared heading text instead. */}
      <span className="text-sm font-medium text-ink">Date range</span>
      <Slider
        value={liveValue}
        onChange={(_event, newValue) => {
          const [start, end] = newValue as number[];
          setLiveValue([start, end]);
        }}
        onChangeCommitted={(_event, newValue) => {
          const [start, end] = newValue as number[];
          onChange([start, end]);
        }}
        min={min}
        max={max}
        step={1}
        marks
        valueLabelDisplay="auto"
        disableSwap
        tabIndex={0}
        getAriaLabel={getAriaLabel}
        getAriaValueText={getAriaValueText}
        sx={{
          color: colors.accent,
          "& .MuiSlider-thumb": {
            backgroundColor: colors.accent,
            "&:focus-visible, &.Mui-focusVisible": {
              boxShadow: `0 0 0 3px ${hexToRgba(colors.accent, 0.15)}`,
            },
          },
          "& .MuiSlider-track": { backgroundColor: colors.accent },
          "& .MuiSlider-rail": { backgroundColor: colors.ink, opacity: 0.2 },
          "& .MuiSlider-valueLabel": { fontFamily: "var(--font-mono)" },
        }}
      />
      <p className="font-mono text-sm text-ink">
        {liveValue[0]} – {liveValue[1]}
      </p>
    </div>
  );
}
