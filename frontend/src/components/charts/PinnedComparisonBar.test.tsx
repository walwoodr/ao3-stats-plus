import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinnedComparisonBar } from "./PinnedComparisonBar";

// Testing task 7 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1, §1.3, §3 item 3's "Item 3<->4 (elapsed time)"): does
// not exist yet - every test below fails at the import, a genuine red for
// this whole file.
//
// Contract assumed here (this Testing stage's own translation of §1.3's
// "Comparing from <date> · Clear" + §3 item 3's "PinnedComparisonBar
// includes the elapsed span ... e.g. '42 days later'" into a concrete,
// stateless prop shape - the elapsed span is only meaningful once BOTH a
// pin and an active hover exist, so it's an optional/nullable prop the
// caller computes via pointComparison.elapsedLabel and passes in, rather
// than this component knowing about dates/epochs itself):
//   pinnedLabel: string          - the pinned point's display label
//   elapsedLabel?: string | null - from pointComparison.elapsedLabel, or
//                                   omitted/null when nothing is hovered
//   onClear: () => void
// Implementation must match this contract, or flag back if it's wrong.
function renderBar(props: { pinnedLabel: string; elapsedLabel?: string | null; onClear?: () => void }) {
  const onClear = props.onClear ?? vi.fn();
  render(
    <PinnedComparisonBar
      pinnedLabel={props.pinnedLabel}
      elapsedLabel={props.elapsedLabel}
      onClear={onClear}
    />,
  );
  return onClear;
}

describe("PinnedComparisonBar: content", () => {
  it("announces the pinned point's date/label", () => {
    renderBar({ pinnedLabel: "2026-01-04" });

    expect(screen.getByText(/comparing from 2026-01-04/i)).toBeInTheDocument();
  });

  it("shows the elapsed-time note when provided (item 3<->4)", () => {
    renderBar({ pinnedLabel: "2026-01-04", elapsedLabel: "42 days later" });

    expect(screen.getByText(/42 days later/i)).toBeInTheDocument();
  });

  it("shows no elapsed-time note when it is omitted (nothing currently hovered)", () => {
    renderBar({ pinnedLabel: "2026-01-04" });

    expect(screen.queryByText(/days later|days earlier|same day/i)).not.toBeInTheDocument();
  });

  it("shows no elapsed-time note when it is explicitly null", () => {
    renderBar({ pinnedLabel: "2026-01-04", elapsedLabel: null });

    expect(screen.queryByText(/days later|days earlier|same day/i)).not.toBeInTheDocument();
  });

  it("renders the estimated-baseline lead-in's label verbatim when that's what's pinned", () => {
    renderBar({ pinnedLabel: "Before 2014 (estimated baseline)" });

    expect(
      screen.getByText(/comparing from before 2014 \(estimated baseline\)/i),
    ).toBeInTheDocument();
  });
});

describe("PinnedComparisonBar: Clear control (discoverable unpin, D5)", () => {
  it("renders a real, labeled Clear button", () => {
    renderBar({ pinnedLabel: "2026-01-04" });

    expect(screen.getByRole("button", { name: /clear comparison/i })).toBeInTheDocument();
  });

  it("calls onClear when the Clear button is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ pinnedLabel: "2026-01-04", onClear });

    await user.click(screen.getByRole("button", { name: /clear comparison/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-operable: Enter on the focused Clear button calls onClear", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar({ pinnedLabel: "2026-01-04", onClear });

    screen.getByRole("button", { name: /clear comparison/i }).focus();
    await user.keyboard("{Enter}");

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("is reachable via Tab", async () => {
    const user = userEvent.setup();
    renderBar({ pinnedLabel: "2026-01-04" });

    await user.tab();

    expect(screen.getByRole("button", { name: /clear comparison/i })).toHaveFocus();
  });
});
