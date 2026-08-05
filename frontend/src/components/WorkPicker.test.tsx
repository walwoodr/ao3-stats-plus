import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker, type WorkPickerProps } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// WorkPicker is rebuilt as an MUI `Autocomplete` combobox (docs/plans/
// work-comparison-picker-redesign.md, resolved decisions 1-5): chips in the
// closed field (`renderValue`), fandom subsections via `groupBy` +
// `renderGroup` with a clickable tri-state bulk-select header, type-to-
// filter by title AND fandom, cap-aware `getOptionDisabled`. It stays a
// controlled component (props unchanged: `perWorkSeries`, `selectedWorkIds`,
// `onChange`, `extraStatusMessage`) - only its internals change from the old
// grouped-checkbox markup. `ControlledWorkPicker` mimics the real
// WorkComparisonSection round trip for tests that need to observe a change
// reflected back (e.g. a multi-fandom work's other appearance, or select-all
// applied twice).
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

// The combobox's accessible name (via its TextField label). Every test opens
// it through this same query rather than hand-rolling `getByRole("textbox")`
// - matching the WAI-ARIA combobox pattern §11 says `Autocomplete` provides
// out of the box (verified against installed `useAutocomplete.js`: the input
// carries `role="combobox"`, the popup `role="listbox"`, each option
// `role="option"` with `aria-selected`/`aria-disabled`).
function getCombobox() {
  return screen.getByRole("combobox", { name: /works to compare/i });
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getCombobox());
}

describe("WorkPicker", () => {
  describe("combobox field", () => {
    it("renders a combobox labeled 'Works to compare'", () => {
      render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

      expect(getCombobox()).toBeInTheDocument();
    });

    it("shows grouped fandom options once opened (each fandom's bulk-select header plus its works)", async () => {
      const user = userEvent.setup();
      render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

      await openPicker(user);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Gamma" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select all.*fandom one/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select all.*fandom two/i })).toBeInTheDocument();
    });

    it("renders selectedWorkIds as removable chips in the closed field, without opening the popup", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      expect(screen.getByLabelText("Remove Alpha")).toBeInTheDocument();
      expect(screen.queryByLabelText("Remove Beta")).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("selecting/deselecting via options and chips", () => {
    it("clicking an unselected option adds it (addWork semantics: appended in order)", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(screen.getByRole("option", { name: "Beta" }));

      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });

    it("clicking an already-selected option removes it", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[1, 2]}
          onChange={onChange}
        />,
      );

      await openPicker(user);
      await user.click(screen.getByRole("option", { name: "Alpha" }));

      expect(onChange).toHaveBeenCalledWith([2]);
    });

    it("clicking a chip's delete ('x') removes that work without needing the popup open", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[1, 2]}
          onChange={onChange}
        />,
      );

      await user.click(screen.getByLabelText("Remove Alpha"));

      expect(onChange).toHaveBeenCalledWith([2]);
    });
  });

  describe("fandom-header bulk select (requirement 8's tri-state semantics)", () => {
    it("selects all works in a fandom, additively, when none of them are selected", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[3]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(screen.getByRole("button", { name: /select all.*fandom one/i }));

      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2, 3]));
      expect(onChange.mock.calls[0][0]).toHaveLength(3);
    });

    it("deselects every work in a fandom once all of them are already selected", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[1, 2, 3]}
          onChange={onChange}
        />,
      );

      await openPicker(user);
      await user.click(screen.getByRole("button", { name: /deselect all.*fandom one/i }));

      expect(onChange).toHaveBeenCalledWith([3]);
    });

    it("fills a partially-selected fandom to 100% (adds the rest) rather than deselecting any", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(screen.getByRole("button", { name: /select all.*fandom one/i }));

      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2]));
      expect(onChange.mock.calls[0][0]).toHaveLength(2);
    });

    it("truncates a select-all that would exceed the cap and announces the truncation", async () => {
      const user = userEvent.setup();
      const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
        work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
      );
      render(<ControlledWorkPicker perWorkSeries={ELEVEN_WORKS} />);

      await openPicker(user);
      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(10);
      expect(screen.getByRole("status")).toHaveTextContent(/added 10 of 11 works/i);
      expect(screen.getByRole("status")).toHaveTextContent(/10-work maximum reached/i);
    });
  });

  describe("a multi-fandom work", () => {
    const MULTI_FANDOM_WORKS: PerWorkSeries[] = [
      work({ ao3WorkId: 1, title: "Crossover Fic", fandoms: "Fandom One, Fandom Two" }),
      work({ ao3WorkId: 2, title: "Beta", fandoms: "Fandom One" }),
      work({ ao3WorkId: 3, title: "Gamma", fandoms: "Fandom Two" }),
    ];

    it("renders one option per fandom it belongs to (option-flattening, §3)", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={MULTI_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);

      expect(screen.getAllByRole("option", { name: "Crossover Fic" })).toHaveLength(2);
    });

    it("toggling any one appearance toggles the single underlying work everywhere it appears", async () => {
      const user = userEvent.setup();
      render(<ControlledWorkPicker perWorkSeries={MULTI_FANDOM_WORKS} />);

      await openPicker(user);
      const [firstAppearance] = screen.getAllByRole("option", { name: "Crossover Fic" });
      await user.click(firstAppearance);

      const bothAppearances = screen.getAllByRole("option", { name: "Crossover Fic" });
      bothAppearances.forEach((option) => expect(option).toHaveAttribute("aria-selected", "true"));
      expect(screen.getByLabelText("Remove Crossover Fic")).toBeInTheDocument();
    });

    it("select-all across two overlapping fandoms never double-adds the shared work", async () => {
      const user = userEvent.setup();
      render(<ControlledWorkPicker perWorkSeries={MULTI_FANDOM_WORKS} />);

      await openPicker(user);
      await user.click(screen.getByRole("button", { name: /select all.*fandom one/i }));
      await user.click(screen.getByRole("button", { name: /select all.*fandom two/i }));

      // Three underlying works total (Crossover Fic, Beta, Gamma) - exactly
      // three chips, not four, even though Crossover Fic has two option rows.
      expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(3);
    });

    it("renders exactly one chip per selected work, even for a multi-fandom work with two option rows", async () => {
      render(
        <WorkPicker
          perWorkSeries={MULTI_FANDOM_WORKS}
          selectedWorkIds={[1]}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getAllByLabelText("Remove Crossover Fic")).toHaveLength(1);
    });
  });

  describe("a work with an empty fandoms string", () => {
    it("is grouped under a 'No fandom' section rather than dropped", async () => {
      const user = userEvent.setup();
      const worksWithNoFandom = [work({ ao3WorkId: 1, title: "Standalone", fandoms: "" })];

      render(
        <WorkPicker perWorkSeries={worksWithNoFandom} selectedWorkIds={[]} onChange={vi.fn()} />,
      );
      await openPicker(user);

      expect(screen.getByRole("option", { name: "Standalone" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select all.*no fandom/i })).toBeInTheDocument();
    });
  });
});
