import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker, type WorkPickerProps } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// WorkPicker is an MUI `Autocomplete` combobox (docs/plans/work-comparison-
// picker-redesign.md, then refined by docs/plans/work-comparison-picker-
// refinements.md). This file covers the core interaction surface that's
// UNCHANGED by the refinements plan (chip rendering/removal, select/
// deselect, type-to-filter, the 10-work cap) plus requirement 7's static
// label (T1). The fandom-header-as-option behavior (requirement 1, T2-T4)
// lives in WorkPicker.header.test.tsx; icon recolor/selected-row tint/hover/
// Clear all (requirement 2/5/8/4, T5-T8) live in WorkPicker.styling.test.tsx;
// the removed bulk-select-bar + uncontrolled-open regression (T9) lives in
// WorkPicker.popupOpen.test.tsx - split for the same per-concern,
// file-length reason WorkComparisonSection's suite is already split.
//
// The fandom header is now a genuine synthetic `role="option"` entry in
// `options` (not a `role="button"` bar sibling - the refinements plan's
// load-bearing decision, §1), so every helper below that used to click a
// `role="button"` bulk-select control now clicks a `role="option"` header
// instead. `ControlledWorkPicker` mimics the real WorkComparisonSection
// round trip for tests that need to observe a change reflected back (e.g. a
// multi-fandom work's other appearance, or select-all applied twice).
function ControlledWorkPicker(props: Omit<WorkPickerProps, "selectedWorkIds" | "onChange">) {
  const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>([]);
  return <WorkPicker {...props} selectedWorkIds={selectedWorkIds} onChange={setSelectedWorkIds} />;
}

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], bookmarks: [], ...overrides };
}

const TWO_FANDOM_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, title: "Alpha", fandoms: "Fandom One" }),
  work({ ao3WorkId: 2, title: "Beta", fandoms: "Fandom One" }),
  work({ ao3WorkId: 3, title: "Gamma", fandoms: "Fandom Two" }),
];

// The combobox's accessible name. Every test opens it through this same
// query rather than hand-rolling `getByRole("textbox")` - matching the
// WAI-ARIA combobox pattern `Autocomplete` provides out of the box (the
// input carries `role="combobox"`, the popup `role="listbox"`, each option
// `role="option"` with `aria-selected`/`aria-disabled`). Works identically
// whether the accessible name is computed from a MUI floating label or (per
// requirement 7) `aria-labelledby` to a plain static span - this helper
// doesn't care how the name was computed, only that it resolves.
function getCombobox() {
  return screen.getByRole("combobox", { name: /works to compare/i });
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getCombobox());
}

function getFandomHeaderOption(fandomFragment: string) {
  return screen.getByRole("option", { name: new RegExp(fandomFragment, "i") });
}

describe("WorkPicker", () => {
  describe("combobox field", () => {
    it("renders a combobox labeled 'Works to compare'", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      expect(getCombobox()).toBeInTheDocument();
    });

    it("shows grouped fandom options once opened (work rows for every fandom)", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Gamma" })).toBeInTheDocument();
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

  // Requirement 7 (§7/T1): both controls get a plain static label matching
  // DateRangeSlider's own `<span>Date range</span>` pattern, and the MUI
  // floating `TextField label` (with its animated `.MuiInputLabel-root`) is
  // dropped entirely. A placeholder is NOT an accessible name (§Accessibility
  // - the single highest a11y risk this plan calls out), so the combobox's
  // name must survive via `aria-labelledby` to the static span, not vanish.
  describe("static label (requirement 7 - no MUI floating label)", () => {
    it("renders a static 'Works to compare' label as a plain element, not an MUI InputLabel", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      expect(screen.getByText("Works to compare")).toBeInTheDocument();
      expect(document.querySelector(".MuiInputLabel-root")).not.toBeInTheDocument();
      expect(document.querySelector(".MuiFormLabel-root")).not.toBeInTheDocument();
    });

    it("associates the combobox's accessible name with the static label via aria-labelledby", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      const label = screen.getByText("Works to compare");
      const combobox = getCombobox();

      expect(combobox).toHaveAccessibleName("Works to compare");
      expect(label.id).toBeTruthy();
      expect(combobox.getAttribute("aria-labelledby")).toContain(label.id);
    });

    it("keeps the 'Search title or fandom' placeholder hint", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      expect(getCombobox()).toHaveAttribute("placeholder", "Search title or fandom");
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

  describe("fandom-header bulk select via the synthetic option (semantics unchanged from the prior bulk-select-bar)", () => {
    it("selects all works in a fandom, additively, when none of them are selected", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[3]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(getFandomHeaderOption("fandom one"));

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
      await user.click(getFandomHeaderOption("fandom one"));

      expect(onChange).toHaveBeenCalledWith([3]);
    });

    it("truncates a select-all that would exceed the cap and announces the truncation", async () => {
      const user = userEvent.setup();
      const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
        work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
      );
      render(<ControlledWorkPicker perWorkSeries={ELEVEN_WORKS} />);

      await openPicker(user);
      await user.click(getFandomHeaderOption("big fandom"));

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

    it("renders one option per fandom it belongs to (option-flattening)", async () => {
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
      await user.click(getFandomHeaderOption("fandom one"));
      await user.click(getFandomHeaderOption("fandom two"));

      // Three underlying works total (Crossover Fic, Beta, Gamma) - exactly
      // three chips, not four, even though Crossover Fic has two option rows.
      expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(3);
    });

    it("renders exactly one chip per selected work, even for a multi-fandom work with two option rows", async () => {
      render(
        <WorkPicker perWorkSeries={MULTI_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
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
      expect(getFandomHeaderOption("no fandom")).toBeInTheDocument();
    });
  });

  describe("at the 10-work cap", () => {
    const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
      work({ ao3WorkId: i + 1, title: `Work ${i + 1}`, fandoms: "Big Fandom" }),
    );
    const TEN_SELECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it("aria-disables remaining unselected options once 10 are selected (getOptionDisabled)", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      await openPicker(user);

      expect(screen.getByRole("option", { name: "Work 11" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("does not disable already-selected options at the cap (they stay removable)", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      await openPicker(user);

      expect(screen.getByRole("option", { name: "Work 1" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByLabelText("Remove Work 1")).toBeInTheDocument();
    });

    // Corner case (plan's Corner cases section): a full fandom must stay
    // deselectable even at cap, so the header option is never aria-disabled
    // - unlike work options, which do get aria-disabled once unselected and
    // the cap is reached.
    it("never aria-disables the fandom-header option, even at the cap", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker
          perWorkSeries={ELEVEN_WORKS}
          selectedWorkIds={TEN_SELECTED}
          onChange={vi.fn()}
        />,
      );

      await openPicker(user);

      expect(getFandomHeaderOption("big fandom")).not.toHaveAttribute("aria-disabled", "true");
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
  });

  describe("type-to-filter (matches title AND fandom name)", () => {
    it("filters options by title", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.type(getCombobox(), "Alph");

      expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Beta" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Gamma" })).not.toBeInTheDocument();
    });

    it("filters options by fandom name, keeping the whole matching fandom's works visible", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.type(getCombobox(), "Fandom Two");

      expect(screen.getByRole("option", { name: "Gamma" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Beta" })).not.toBeInTheDocument();
    });

    it("shows an empty-result state when the filter matches neither title nor fandom", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.type(getCombobox(), "nonexistent-zzz");

      expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("hides a fandom's header option once every one of its works is filtered out", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.type(getCombobox(), "Fandom One");

      expect(getFandomHeaderOption("fandom one")).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /fandom two/i })).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("names each chip's delete control 'Remove {title}'", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1, 2]} onChange={vi.fn()} />,
      );

      expect(screen.getByLabelText("Remove Alpha")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove Beta")).toBeInTheDocument();
    });

    it("deletes the last-selected work on Backspace when the (empty) combobox input is focused", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[1, 2]}
          onChange={onChange}
        />,
      );

      getCombobox().focus();
      await user.keyboard("{Backspace}");

      expect(onChange).toHaveBeenCalledWith([1]);
    });

    it("keeps exactly one role=status live region in the rendered tree", () => {
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[]}
          onChange={vi.fn()}
          extraStatusMessage="Comparing 0 works."
        />,
      );

      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent(/comparing 0 works/i);
    });
  });
});
