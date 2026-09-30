import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeSlider, type DateRangeSliderProps } from "./DateRangeSlider";

// DateRangeSlider wraps MUI `Slider` in range mode (decision B, resolved by
// the user - see the plan's "Resolved design decisions"). @mui/material,
// @emotion/react, and @emotion/styled are installed and used by other
// already-shipped components in this codebase, so these tests are NOT
// expected to fail on import.
//
// docs/plans/date-range-slider-month-granularity.md (D1/D2, §3): the slider's
// domain is re-encoded from whole-year integers to month indices
// (`year * 12 + (month - 1)`) - props keep their SHAPE (`min`/`max`/
// `value: [number, number]`, all still plain numbers), only the semantic
// interpretation changes. `mi(year, month)` below duplicates the same
// encoding lib/monthIndex.ts uses, kept local/self-contained rather than
// importing the new lib (this file tests DateRangeSlider, not monthIndex.ts
// itself - lib/monthIndex.test.ts owns that coverage directly).
function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

const MIN = mi(2018, 1); // Jan 2018
const MAX = mi(2026, 12); // Dec 2026

// docs/plans/work-comparison-picker-refinements.md §3.2 REMOVES the old
// `unionPointCount <= 2` null-return gate: the component now always
// renders, and instead derives `disabled = unionPointCount <= 2` and passes
// it straight to MUI's own `Slider` `disabled` prop. The drag-fix regression
// tests below (onChange vs. onChangeCommitted) are UNCHANGED IN INTENT -
// disabling the control doesn't touch that split at all - but their
// `getByRole` name matcher drops "(year)" along with every other query in
// this file, per getAriaLabel's own change (§3).
function ControlledDateRangeSlider(
  props: Omit<DateRangeSliderProps, "value" | "onChange"> & {
    initialValue: [number, number];
  },
) {
  const [value, setValue] = useState<[number, number]>(props.initialValue);
  return <DateRangeSlider {...props} value={value} onChange={setValue} />;
}

function startThumb() {
  return screen.getByRole("slider", { name: /^range start$/i });
}
function endThumb() {
  return screen.getByRole("slider", { name: /^range end$/i });
}

describe("DateRangeSlider", () => {
  describe("always rendered - disabled below the >2 union-points threshold", () => {
    it("renders (never returns null) when unionPointCount is 0", () => {
      const { container } = render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={0} />,
      );

      expect(container).not.toBeEmptyDOMElement();
      expect(screen.getAllByRole("slider")).toHaveLength(2);
    });

    it("is disabled when unionPointCount is 0", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={0} />,
      );

      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).toBeDisabled());
    });

    it("is disabled when unionPointCount is exactly 2 (boundary - not '>2')", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={2} />,
      );

      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).toBeDisabled());
    });

    it("is enabled (not disabled) when unionPointCount is exactly 3 (boundary - '>2' means >= 3)", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={3} />,
      );

      expect(screen.getAllByRole("slider")).toHaveLength(2);
      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).not.toBeDisabled());
    });
  });

  describe("disabled-state visual/data treatment (§3.2/§3.3)", () => {
    it("still shows the passed-in value range as 'MMM YYYY – MMM YYYY' in the visible readout while disabled", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={1} />,
      );

      expect(screen.getByText(/Jan 2018\s*[–-]\s*Dec 2026/)).toBeInTheDocument();
    });

    it("keeps the 'Date range' heading visible while disabled, so the control's purpose stays clear", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={0} />,
      );

      expect(screen.getByText("Date range")).toBeInTheDocument();
    });

    it("still exposes correct min/max bounds on the disabled thumbs (aria-valuemin/aria-valuemax as month indices)", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={0} />,
      );

      expect(startThumb()).toHaveAttribute("aria-valuemin", String(MIN));
      expect(startThumb()).toHaveAttribute("aria-valuemax", String(MAX));
    });

    it("does not call onChange in response to a keyboard step while disabled (interaction genuinely suppressed)", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={onChange} unionPointCount={0} />,
      );

      startThumb().focus();
      await user.keyboard("{ArrowRight}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("rendered (>2 union points)", () => {
    it("renders two thumbs with role=slider", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      expect(screen.getAllByRole("slider")).toHaveLength(2);
    });

    it("labels the start thumb 'Range start' via getAriaLabel (no '(year)' suffix - month/year is in the value text)", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      expect(startThumb()).toBeInTheDocument();
    });

    it("labels the end thumb 'Range end' via getAriaLabel", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      expect(endThumb()).toBeInTheDocument();
    });

    it("supplies a full 'Month YYYY' aria-valuetext for each thumb via getAriaValueText->formatMonthIndex(..., 'long')", () => {
      render(
        <DateRangeSlider
          min={MIN}
          max={MAX}
          value={[mi(2019, 3), mi(2024, 11)]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(startThumb()).toHaveAttribute("aria-valuetext", "March 2019");
      expect(endThumb()).toHaveAttribute("aria-valuetext", "November 2024");
    });

    it("shows a visible mono-font readout of the current window as 'MMM YYYY – MMM YYYY'", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      expect(screen.getByText(/Jan 2018\s*[–-]\s*Dec 2026/)).toBeInTheDocument();
    });

    it("updates the visible readout when the value prop changes", () => {
      const { rerender } = render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      rerender(
        <DateRangeSlider
          min={MIN}
          max={MAX}
          value={[mi(2020, 6), mi(2022, 2)]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getByText(/Jun 2020\s*[–-]\s*Feb 2022/)).toBeInTheDocument();
      expect(screen.queryByText(/Jan 2018\s*[–-]\s*Dec 2026/)).not.toBeInTheDocument();
    });

    it("shows a short 'MMM YYYY' value-label tooltip via valueLabelFormat", () => {
      const { container } = render(
        <DateRangeSlider
          min={MIN}
          max={MAX}
          value={[mi(2019, 3), mi(2024, 11)]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      const labelTexts = Array.from(container.querySelectorAll(".MuiSlider-valueLabelLabel")).map(
        (el) => el.textContent,
      );
      expect(labelTexts).toContain("Mar 2019");
      expect(labelTexts).toContain("Nov 2024");
    });

    it("replaces the boolean `marks` with explicit unlabeled year-boundary marks (one per January in range)", () => {
      const { container } = render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      // 2018..2026 inclusive = 9 Januaries.
      expect(container.querySelectorAll(".MuiSlider-mark")).toHaveLength(9);
    });

    it("increases the start thumb's value by exactly one MONTH via the ArrowRight key", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider min={MIN} max={MAX} initialValue={[MIN, MAX]} unionPointCount={5} />,
      );

      startThumb().focus();
      await user.keyboard("{ArrowRight}");

      expect(startThumb()).toHaveAttribute("aria-valuenow", String(MIN + 1));
    });

    it("decreases the end thumb's value by exactly one MONTH via the ArrowLeft key", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider min={MIN} max={MAX} initialValue={[MIN, MAX]} unionPointCount={5} />,
      );

      endThumb().focus();
      await user.keyboard("{ArrowLeft}");

      expect(endThumb()).toHaveAttribute("aria-valuenow", String(MAX - 1));
    });

    it("clamps crossover - the start thumb cannot be pushed past the end thumb's value", async () => {
      const user = userEvent.setup();
      const bothAtSameMonth = mi(2025, 6);
      render(
        <ControlledDateRangeSlider
          min={MIN}
          max={MAX}
          initialValue={[bothAtSameMonth, bothAtSameMonth]}
          unionPointCount={5}
        />,
      );

      startThumb().focus();
      await user.keyboard("{ArrowRight}");

      const startValue = Number(startThumb().getAttribute("aria-valuenow"));
      const endValue = Number(endThumb().getAttribute("aria-valuenow"));
      expect(startValue).toBeLessThanOrEqual(endValue);
    });

    it("clamps the end thumb to min/max domain bounds", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider min={MIN} max={MAX} initialValue={[MIN, MAX]} unionPointCount={5} />,
      );

      endThumb().focus();
      await user.keyboard("{ArrowRight}");

      expect(endThumb()).toHaveAttribute("aria-valuenow", String(MAX));
    });

    it("keeps each thumb keyboard-focusable (tabIndex 0)", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      screen.getAllByRole("slider").forEach((thumb) => {
        expect(thumb).toHaveAttribute("tabIndex", "0");
      });
    });
  });

  // A real architectural bug, found by the user in the live app and
  // confirmed via extensive e2e investigation: the `onChange` prop was
  // wired to MUI Slider's own continuous `onChange` (fires on every pixel
  // of a drag, not just on release), which drove the parent's Zustand
  // store write - and therefore a full WorkComparisonSection + both
  // MultiSeriesTrendChart re-renders/repaints - on EVERY intermediate drag
  // position, not just once at the end. Fix: split MUI Slider's own cheap,
  // continuous `onChange` (local-only, keeps the thumb/readout visually
  // live during a drag) from `onChangeCommitted` (fires once - on drag
  // release, on a completed keyboard step, or on a plain rail click -
  // verified directly against the installed MUI source) which is what
  // drives the expensive `onChange` prop callback the parent uses to
  // update the store/filter the graphs. This split is UNCHANGED by the
  // month-granularity work (docs/plans/date-range-slider-month-
  // granularity.md §3) - only the value semantics moved, not the
  // interaction wiring - so these tests must keep passing unmodified in
  // BEHAVIOR (their aria-label queries are updated to match getAriaLabel's
  // new "(year)"-less text, same as every other query in this file).
  describe("decoupling live drag feedback from the expensive onChange prop (regression)", () => {
    function fireDrag(thumb: HTMLElement, clientX: number) {
      fireEvent.pointerDown(thumb, { pointerId: 1, clientX, isPrimary: true, buttons: 1 });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: clientX + 40, buttons: 1 });
    }

    it("does NOT call the onChange prop while a drag is still in progress (only MUI's own onChange fired, not onChangeCommitted)", () => {
      const onChange = vi.fn();
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={onChange} unionPointCount={5} />,
      );

      fireDrag(startThumb(), 0);

      expect(onChange).not.toHaveBeenCalled();

      fireEvent.pointerUp(document, { pointerId: 1 });
    });

    it("calls the onChange prop once the drag is released (onChangeCommitted)", () => {
      const onChange = vi.fn();
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={onChange} unionPointCount={5} />,
      );

      fireDrag(startThumb(), 0);
      fireEvent.pointerUp(document, { pointerId: 1 });

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("still keeps the visible readout live-updating DURING the drag, even though the onChange prop hasn't committed yet", () => {
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={vi.fn()} unionPointCount={5} />,
      );

      fireDrag(startThumb(), 0);

      expect(startThumb()).not.toHaveAttribute("aria-valuenow", String(MIN));

      fireEvent.pointerUp(document, { pointerId: 1 });
    });

    it("still commits immediately (a single onChange call) for a keyboard-driven step, not just on drag release", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateRangeSlider min={MIN} max={MAX} value={[MIN, MAX]} onChange={onChange} unionPointCount={5} />,
      );

      startThumb().focus();
      await user.keyboard("{ArrowRight}");

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([MIN + 1, MAX]);
    });
  });
});
