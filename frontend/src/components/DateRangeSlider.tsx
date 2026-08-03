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
        value={value}
        onChange={(_event, newValue) => {
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
        {value[0]} – {value[1]}
      </p>
    </div>
  );
}
