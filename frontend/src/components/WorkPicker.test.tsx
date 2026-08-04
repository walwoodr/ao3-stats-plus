import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker, type WorkPickerProps } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// WorkPicker is a controlled component: it owns no selection state itself,
// just renders `selectedWorkIds` and reports every change via `onChange` -
// per the plan's "State management" section, the real state lives in
// WorkComparisonSection's useState. This wrapper mimics that so tests can
// exercise real check/uncheck round trips (e.g. "checking a multi-fandom
// work in one group reflects as checked in the other").
function ControlledWorkPicker(props: Omit<WorkPickerProps, "selectedWorkIds" | "onChange">) {
  const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([]);
  return <WorkPicker {...props} selectedWorkIds={selectedWorkIds} onChange={setSelectedWorkIds} />;
}

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

const TWO_FANDOM_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, title: "Alpha", fandoms: "Fandom One" }),
  work({ ao3WorkId: 2, title: "Beta", fandoms: "Fandom One" }),
  work({ ao3WorkId: 3, title: "Gamma", fandoms: "Fandom Two" }),
];

describe("WorkPicker", () => {
  it("renders an outer fieldset/legend naming the control 'Works to compare'", () => {
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("group", { name: /works to compare/i })).toBeInTheDocument();
  });

  it("renders a nested fieldset/legend per fandom group", () => {
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Fandom One" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Fandom Two" })).toBeInTheDocument();
  });

  it("renders one labeled checkbox per work", () => {
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Gamma" })).toBeInTheDocument();
  });

  it("reflects selectedWorkIds as checked", () => {
    render(
      <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).not.toBeChecked();
  });

  it("calls onChange with the work added when an unchecked checkbox is checked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("calls onChange with the work removed when a checked checkbox is unchecked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1, 2]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));

    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it("renders a 'select all in fandom' control per fandom group naming that fandom", () => {
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /select all.*fandom one/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select all.*fandom two/i })).toBeInTheDocument();
  });

  it("select-all-in-fandom adds every work in that fandom, additively (not replacing the current selection)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[3]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: /select all.*fandom one/i }));

    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2, 3]));
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
  });

  describe("a multi-fandom work", () => {
    const MULTI_FANDOM_WORKS: PerWorkSeries[] = [
      work({ ao3WorkId: 1, title: "Crossover Fic", fandoms: "Fandom One, Fandom Two" }),
      work({ ao3WorkId: 2, title: "Beta", fandoms: "Fandom One" }),
      work({ ao3WorkId: 3, title: "Gamma", fandoms: "Fandom Two" }),
    ];

    it("appears under every fandom group it belongs to", () => {
      render(
        <WorkPicker perWorkSeries={MULTI_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      const fandomOneGroup = screen.getByRole("group", { name: "Fandom One" });
      const fandomTwoGroup = screen.getByRole("group", { name: "Fandom Two" });

      expect(
        within(fandomOneGroup).getByRole("checkbox", { name: "Crossover Fic" }),
      ).toBeInTheDocument();
      expect(
        within(fandomTwoGroup).getByRole("checkbox", { name: "Crossover Fic" }),
      ).toBeInTheDocument();
    });

    it("checking it in one group reflects as checked in every group it appears in (one underlying work)", async () => {
      const user = userEvent.setup();
      render(<ControlledWorkPicker perWorkSeries={MULTI_FANDOM_WORKS} />);

      const fandomOneGroup = screen.getByRole("group", { name: "Fandom One" });
      await user.click(within(fandomOneGroup).getByRole("checkbox", { name: "Crossover Fic" }));

      const fandomTwoGroup = screen.getByRole("group", { name: "Fandom Two" });
      expect(within(fandomTwoGroup).getByRole("checkbox", { name: "Crossover Fic" })).toBeChecked();
    });

    it("select-all in two overlapping fandoms never double-adds the shared work", async () => {
      const user = userEvent.setup();
      render(<ControlledWorkPicker perWorkSeries={MULTI_FANDOM_WORKS} />);

      await user.click(screen.getByRole("button", { name: /select all.*fandom one/i }));
      await user.click(screen.getByRole("button", { name: /select all.*fandom two/i }));

      // All three underlying works end up selected exactly once each. Beta/
      // Gamma are single-fandom, so one checkbox apiece; Crossover Fic
      // renders in both fandom groups (see "appears under every fandom
      // group it belongs to" above), so its selected state must be checked
      // on both physical checkboxes, not asserted via a singular unscoped
      // query (which would throw "found multiple elements" given the same
      // two-DOM-node requirement that test establishes).
      expect(screen.getByRole("checkbox", { name: "Beta" })).toBeChecked();
      const crossoverCheckboxes = screen.getAllByRole("checkbox", { name: "Crossover Fic" });
      expect(crossoverCheckboxes).toHaveLength(2);
      crossoverCheckboxes.forEach((checkbox) => expect(checkbox).toBeChecked());
      expect(screen.getByRole("checkbox", { name: "Gamma" })).toBeChecked();
    });
  });

  describe("at the 10-work cap", () => {
    const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
      work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
    );
    const TEN_SELECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it("disables and aria-disables remaining unchecked checkboxes once 10 are selected", () => {
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      const eleventh = screen.getByRole("checkbox", { name: "Work 11" });
      expect(eleventh).toBeDisabled();
      expect(eleventh).toHaveAttribute("aria-disabled", "true");
    });

    it("does not disable already-checked checkboxes at the cap (they must stay uncheckable, not un-uncheckable)", () => {
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByRole("checkbox", { name: "Work 1" })).not.toBeDisabled();
    });

    it("announces the cap via a role=status polite live region", () => {
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent(/maximum of 10 works reached/i);
    });

    it("does not show the cap message when under the cap", () => {
      render(
        <WorkPicker perWorkSeries={ELEVEN_WORKS} selectedWorkIds={[1, 2]} onChange={vi.fn()} />,
      );

      expect(screen.queryByText(/maximum of 10 works reached/i)).not.toBeInTheDocument();
    });

    it("select-all-in-fandom that would exceed the cap adds up to the cap and announces the truncation", async () => {
      const user = userEvent.setup();
      render(<ControlledWorkPicker perWorkSeries={ELEVEN_WORKS} />);

      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      const checked = ELEVEN_WORKS.filter((w) =>
        screen.getByRole("checkbox", { name: w.title }).matches(":checked"),
      );
      expect(checked).toHaveLength(10);
      expect(screen.getByRole("status")).toHaveTextContent(/added 10 of 11 works/i);
      expect(screen.getByRole("status")).toHaveTextContent(/10-work maximum reached/i);
    });
  });

  describe("a work with an empty fandoms string", () => {
    it("is grouped under a 'No fandom' fieldset rather than dropped", () => {
      const worksWithNoFandom = [work({ ao3WorkId: 1, title: "Standalone", fandoms: "" })];

      render(
        <WorkPicker perWorkSeries={worksWithNoFandom} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      const noFandomGroup = screen.getByRole("group", { name: /no fandom/i });
      expect(
        within(noFandomGroup).getByRole("checkbox", { name: "Standalone" }),
      ).toBeInTheDocument();
    });
  });
});
