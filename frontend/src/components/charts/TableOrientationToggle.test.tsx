import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TableOrientationToggle } from "./TableOrientationToggle";

// Testing task 6 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1, §3 item 2, §8): TableOrientationToggle.tsx does not
// exist yet - every test below fails at the import, a genuine red for this
// whole file.
//
// §8 specifies "a labeled control (aria-pressed / radio-group semantics),
// keyboard operable (Tab to it, Enter/Space to switch), visible focus ring
// ... Its label names the current state ('Dates across / Dates down')" and
// §3's example wording "Dates: Across / Down" - this Testing stage's own
// concrete translation is a `role="group"` labeled "Table orientation",
// containing two real `<button aria-pressed>`s named "Dates across" /
// "Dates down" (native buttons, so Tab/Enter/Space are free - no custom
// roving-tabindex tablist pattern is needed here, unlike MetricToggle,
// since this is a genuine two-option toggle, not a set of panels).
// Implementation must match this contract, or flag back if it's wrong.
function renderToggle(orientation: "datesAsColumns" | "datesAsRows", onChange = vi.fn()) {
  render(<TableOrientationToggle orientation={orientation} onOrientationChange={onChange} />);
  return onChange;
}

describe("TableOrientationToggle: structure and labeling", () => {
  it("renders a labeled group containing the two orientation buttons", () => {
    renderToggle("datesAsColumns");

    const group = screen.getByRole("group", { name: /table orientation/i });
    expect(screen.getByRole("button", { name: /dates across/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dates down/i })).toBeInTheDocument();
    expect(group).toBeInTheDocument();
  });

  it("marks the 'Dates across' button pressed when orientation is datesAsColumns", () => {
    renderToggle("datesAsColumns");

    expect(screen.getByRole("button", { name: /dates across/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /dates down/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks the 'Dates down' button pressed when orientation is datesAsRows", () => {
    renderToggle("datesAsRows");

    expect(screen.getByRole("button", { name: /dates down/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /dates across/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("TableOrientationToggle: interaction", () => {
  it("calls onOrientationChange('datesAsRows') when 'Dates down' is clicked from datesAsColumns", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("datesAsColumns");

    await user.click(screen.getByRole("button", { name: /dates down/i }));

    expect(onChange).toHaveBeenCalledWith("datesAsRows");
  });

  it("calls onOrientationChange('datesAsColumns') when 'Dates across' is clicked from datesAsRows", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("datesAsRows");

    await user.click(screen.getByRole("button", { name: /dates across/i }));

    expect(onChange).toHaveBeenCalledWith("datesAsColumns");
  });

  it("does not call onOrientationChange when clicking the already-active button", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("datesAsColumns");

    await user.click(screen.getByRole("button", { name: /dates across/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TableOrientationToggle: keyboard operability (§8)", () => {
  it("is reachable via Tab and both buttons are native, focusable buttons", async () => {
    const user = userEvent.setup();
    renderToggle("datesAsColumns");

    await user.tab();
    expect(screen.getByRole("button", { name: /dates across/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /dates down/i })).toHaveFocus();
  });

  it("activates the focused button on Enter", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("datesAsColumns");

    screen.getByRole("button", { name: /dates down/i }).focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("datesAsRows");
  });

  it("activates the focused button on Space", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("datesAsColumns");

    screen.getByRole("button", { name: /dates down/i }).focus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith("datesAsRows");
  });
});
