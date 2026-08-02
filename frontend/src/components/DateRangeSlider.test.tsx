import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeSlider, type DateRangeSliderProps } from "./DateRangeSlider";

// DateRangeSlider wraps MUI `Slider` in range mode (decision B, resolved by
// the user - see the plan's "Resolved design decisions"). @mui/material,
// @emotion/react, and @emotion/styled are not installed yet (that's
// Implementation's job, task 6) - every test in this file is expected to
// fail on import ("Cannot find module '@mui/material'" / similar), not for
// any other reason. That's the correct red state for this stage.
//
// The `>2` union-points visibility gate (Q5) is owned by this component via
// `unionPointCount`, so WorkComparisonSection doesn't need to duplicate the
// gate check before deciding whether to mount it.
function ControlledDateRangeSlider(
  props: Omit<DateRangeSliderProps, "value" | "onChange"> & {
    initialValue: [number, number];
  },
) {
  const [value, setValue] = useState<[number, number]>(props.initialValue);
  return <DateRangeSlider {...props} value={value} onChange={setValue} />;
}

describe("DateRangeSlider", () => {
  describe("the >2 union-points visibility gate", () => {
    it("renders nothing when unionPointCount is 0", () => {
      const { container } = render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={0}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when unionPointCount is exactly 2 (boundary - not '>2')", () => {
      const { container } = render(
        <DateRangeSlider
          min={2018}
          max={2026}
          value={[2018, 2026]}
          onChange={vi.fn()}
          unionPointCount={2}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("renders when unionPointCount is exactly 3 (boundary - '>2' means >= 3)", () => {
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
        <ControlledDateRangeSlider min={2018} max={2026} initialValue={[2018, 2026]} unionPointCount={5} />,
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
        <ControlledDateRangeSlider min={2018} max={2026} initialValue={[2018, 2026]} unionPointCount={5} />,
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
        <ControlledDateRangeSlider min={2018} max={2026} initialValue={[2025, 2025]} unionPointCount={5} />,
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
        <ControlledDateRangeSlider min={2018} max={2026} initialValue={[2018, 2026]} unionPointCount={5} />,
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
});
