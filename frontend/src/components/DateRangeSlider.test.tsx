import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeSlider, type DateRangeSliderProps } from "./DateRangeSlider";

// DateRangeSlider wraps MUI `Slider` in range mode (decision B, resolved by
// the user - see the plan's "Resolved design decisions"). @mui/material,
// @emotion/react, and @emotion/styled are installed and used by other
// already-shipped components in this codebase, so - unlike when this file
// was first written - these tests are NOT expected to fail on import.
//
// docs/plans/work-comparison-picker-refinements.md §3.2 REMOVES the old
// `unionPointCount <= 2` null-return gate: the component now always
// renders, and instead derives `disabled = unionPointCount <= 2` and passes
// it straight to MUI's own `Slider` `disabled` prop. WorkComparisonSection
// (not this component) now always mounts DateRangeSlider unconditionally -
// see WorkComparisonSection.test.tsx/.regression.test.tsx (T11) for that
// side of the change. The drag-fix regression tests below (onChange vs.
// onChangeCommitted) are UNCHANGED and must keep passing unmodified -
// disabling the control doesn't touch that split at all (a disabled MUI
// Slider simply never fires either callback, so there's nothing for the
// split to interact with).
function ControlledDateRangeSlider(
  props: Omit<DateRangeSliderProps, "value" | "onChange"> & {
    initialValue: [number, number];
  },
) {
  const [value, setValue] = useState<[number, number]>(props.initialValue);
  return <DateRangeSlider {...props} value={value} onChange={setValue} />;
}

describe("DateRangeSlider", () => {
  // Requirement 3 (§3.2): the component is now ALWAYS rendered - the old
  // `unionPointCount <= 2` null-return gate is removed and replaced by
  // deriving `disabled` and handing it to MUI Slider's own `disabled` prop.
  describe("always rendered - disabled below the >2 union-points threshold", () => {
    it("renders (never returns null) when unionPointCount is 0", () => {
      const { container } = render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={0}
        />,
      );

      expect(container).not.toBeEmptyDOMElement();
      expect(screen.getAllByRole("slider")).toHaveLength(2);
    });

    it("is disabled when unionPointCount is 0", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={0}
        />,
      );

      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).toBeDisabled());
    });

    it("is disabled when unionPointCount is exactly 2 (boundary - not '>2')", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={2}
        />,
      );

      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).toBeDisabled());
    });

    it("is enabled (not disabled) when unionPointCount is exactly 3 (boundary - '>2' means >= 3)", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={3}
        />,
      );

      expect(screen.getAllByRole("slider")).toHaveLength(2);
      screen.getAllByRole("slider").forEach((thumb) => expect(thumb).not.toBeDisabled());
    });
  });

  describe("disabled-state visual/data treatment (§3.2/§3.3)", () => {
    it("still shows the passed-in value range in the visible readout while disabled", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={1}
        />,
      );

      expect(screen.getByText(/2018\s*[–-]\s*2026/)).toBeInTheDocument();
    });

    it("keeps the 'Date range' heading visible while disabled, so the control's purpose stays clear", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={0}
        />,
      );

      expect(screen.getByText("Date range")).toBeInTheDocument();
    });

    it("still exposes correct min/max bounds on the disabled thumbs (aria-valuemin/aria-valuemax)", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={0}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      expect(startThumb).toHaveAttribute("aria-valuemin", "2018");
      expect(startThumb).toHaveAttribute("aria-valuemax", "2026");
    });

    it("does not call onChange in response to a keyboard step while disabled (interaction genuinely suppressed)", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={onChange}
          unionPointCount={0}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      startThumb.focus();
      await user.keyboard("{ArrowRight}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("rendered (>2 union points)", () => {
    it("renders two thumbs with role=slider", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getAllByRole("slider")).toHaveLength(2);
    });

    it("labels the start thumb 'Range start (year)' via getAriaLabel", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getByRole("slider", { name: /range start \(year\)/i })).toBeInTheDocument();
    });

    it("labels the end thumb 'Range end (year)' via getAriaLabel", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getByRole("slider", { name: /range end \(year\)/i })).toBeInTheDocument();
    });

    it("supplies a spoken aria-valuetext for each thumb via getAriaValueText (e.g. the plain year)", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2019, 2024]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });

      expect(startThumb).toHaveAttribute("aria-valuetext", "2019");
      expect(endThumb).toHaveAttribute("aria-valuetext", "2024");
    });

    it("shows a visible mono-font readout of the current window", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getByText(/2018\s*[–-]\s*2026/)).toBeInTheDocument();
    });

    it("updates the visible readout when the value prop changes", () => {
      const { rerender } = render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      rerender(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2020, 2022]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      expect(screen.getByText(/2020\s*[–-]\s*2022/)).toBeInTheDocument();
      expect(screen.queryByText(/2018\s*[–-]\s*2026/)).not.toBeInTheDocument();
    });

    it("increases the start thumb's year via the ArrowRight key", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider
          min={2018}
          max={2026}
          initialValue={[2018, 2026]}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      startThumb.focus();
      await user.keyboard("{ArrowRight}");

      expect(screen.getByRole("slider", { name: /range start \(year\)/i })).toHaveAttribute(
        "aria-valuenow",
        "2019",
      );
    });

    it("decreases the end thumb's year via the ArrowLeft key", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider
          min={2018}
          max={2026}
          initialValue={[2018, 2026]}
          unionPointCount={5}
        />,
      );

      const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });
      endThumb.focus();
      await user.keyboard("{ArrowLeft}");

      expect(screen.getByRole("slider", { name: /range end \(year\)/i })).toHaveAttribute(
        "aria-valuenow",
        "2025",
      );
    });

    it("clamps crossover - the start thumb cannot be pushed past the end thumb's value", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider
          min={2018}
          max={2026}
          initialValue={[2025, 2025]}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      startThumb.focus();
      await user.keyboard("{ArrowRight}");

      const startValue = Number(
        screen.getByRole("slider", { name: /range start \(year\)/i }).getAttribute("aria-valuenow"),
      );
      const endValue = Number(
        screen.getByRole("slider", { name: /range end \(year\)/i }).getAttribute("aria-valuenow"),
      );
      expect(startValue).toBeLessThanOrEqual(endValue);
    });

    it("clamps the end thumb to min/max domain bounds", async () => {
      const user = userEvent.setup();
      render(
        <ControlledDateRangeSlider
          min={2018}
          max={2026}
          initialValue={[2018, 2026]}
          unionPointCount={5}
        />,
      );

      const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });
      endThumb.focus();
      await user.keyboard("{ArrowRight}");

      expect(screen.getByRole("slider", { name: /range end \(year\)/i })).toHaveAttribute(
        "aria-valuenow",
        "2026",
      );
    });

    it("keeps each thumb keyboard-focusable (tabIndex 0)", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
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
  // verified directly against the installed MUI source, node_modules/
  // @mui/material/Slider/useSlider.js) which is what now drives the
  // expensive `onChange` prop callback the parent uses to update the
  // store/filter the graphs.
  //
  // Separately investigated and RULED OUT as the cause of the user's
  // report: whether a real mouse drag ever reaches MUI's value-commit path
  // at all. Live e2e instrumentation (document-level pointermove listeners
  // reading event.buttons) showed Playwright/CDP's very FIRST synthetic
  // pointermove after page.mouse.down() reports buttons:0 (not yet
  // reflecting the just-pressed button - all SUBSEQUENT synthetic moves
  // correctly report buttons:1). MUI's useSlider.js has an explicit,
  // legitimate guard for this real-world edge case ("cancel move in case
  // some other element consumed a pointerup event and it was not fired") -
  // `if (nativeEvent.type === 'pointermove' && nativeEvent.buttons === 0)
  // { handleTouchEnd(nativeEvent); return; }` - which the CDP artifact
  // trips on the very first move, ending the "drag" (and tearing down
  // MUI's own document listeners) before any real movement is ever
  // recorded. A real human's OS-reported mouse-button state does not have
  // this first-event race, so this is judged to be a Playwright/CDP
  // input-synthesis limitation, not a production bug - these tests
  // therefore set `buttons: 1` explicitly on every synthesized
  // pointermove, matching what a real held mouse button reports.
  describe("decoupling live drag feedback from the expensive onChange prop (regression)", () => {
    function fireDrag(thumb: HTMLElement, clientX: number) {
      fireEvent.pointerDown(thumb, { pointerId: 1, clientX, isPrimary: true, buttons: 1 });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: clientX + 40, buttons: 1 });
    }

    it("does NOT call the onChange prop while a drag is still in progress (only MUI's own onChange fired, not onChangeCommitted)", () => {
      const onChange = vi.fn();
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={onChange}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      fireDrag(startThumb, 0);

      expect(onChange).not.toHaveBeenCalled();

      fireEvent.pointerUp(document, { pointerId: 1 });
    });

    it("calls the onChange prop once the drag is released (onChangeCommitted)", () => {
      const onChange = vi.fn();
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={onChange}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      fireDrag(startThumb, 0);
      fireEvent.pointerUp(document, { pointerId: 1 });

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("still keeps the visible readout live-updating DURING the drag, even though the onChange prop hasn't committed yet", () => {
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={5}
        />,
      );

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      fireDrag(startThumb, 0);

      expect(screen.getByRole("slider", { name: /range start \(year\)/i })).not.toHaveAttribute(
        "aria-valuenow",
        "2018",
      );

      fireEvent.pointerUp(document, { pointerId: 1 });
    });

    it("still commits immediately (a single onChange call) for a keyboard-driven step, not just on drag release", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={onChange}
          unionPointCount={5}
        />,
      );

      screen.getByRole("slider", { name: /range start \(year\)/i }).focus();
      await user.keyboard("{ArrowRight}");

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([2019, 2026]);
    });
  });
});
