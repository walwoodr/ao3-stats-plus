import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker } from "./WorkPicker";
import { LIGHT_COLOR_TOKENS } from "../lib/colorTokens";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Requirements 2, 4, 5, 8 (docs/plans/work-comparison-picker-refinements.md):
// - §2: recolor CheckIcon/TriStateIcon from colors.accent to colors.ink.
// - §4: Autocomplete "Clear" -> "Clear all".
// - §5: selected work rows lose their bold title, gain an 8% accent tint.
// - §8: work/header option rows get a neutral ink hover/keyboard-highlight
//   tint; a SELECTED work row uses a deeper accent hover instead, so the
//   transient hover doesn't visually clobber the persistent selected tint.
//
// window.matchMedia is stubbed to report light mode by default (see
// src/test/setup.ts), so LIGHT_COLOR_TOKENS.ink is the expected resolved
// color for every assertion below - useChartColors.test.ts covers the
// dark-mode branch of the hook itself, not re-verified per-component here.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], bookmarks: [], ...overrides };
}

const TWO_FANDOM_WORKS: PerWorkSeries[] = [
  work({ ao3WorkId: 1, title: "Alpha", fandoms: "Fandom One" }),
  work({ ao3WorkId: 2, title: "Beta", fandoms: "Fandom One" }),
  work({ ao3WorkId: 3, title: "Gamma", fandoms: "Fandom Two" }),
];

function getCombobox() {
  return screen.getByRole("combobox", { name: /works to compare/i });
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getCombobox());
}

function getFandomHeaderOption(fandomFragment: string) {
  return screen.getByRole("option", { name: new RegExp(fandomFragment, "i") });
}

describe("WorkPicker: styling refinements", () => {
  describe("requirement 2 - icon recolor to colors.ink", () => {
    it("renders the selected-work CheckIcon stroke in colors.ink, not colors.accent", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Alpha" });
      const checkGlyph = option.querySelector("polyline");

      expect(checkGlyph).not.toBeNull();
      expect(checkGlyph).toHaveAttribute("stroke", LIGHT_COLOR_TOKENS.ink);
      expect(checkGlyph).not.toHaveAttribute("stroke", LIGHT_COLOR_TOKENS.accent);
    });

    it("renders the fandom-header TriStateIcon stroke in colors.ink, not colors.accent", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");
      const box = header.querySelector("rect");

      expect(box).not.toBeNull();
      expect(box).toHaveAttribute("stroke", LIGHT_COLOR_TOKENS.ink);
      expect(box).not.toHaveAttribute("stroke", LIGHT_COLOR_TOKENS.accent);
    });

    it("still uses a distinct icon shape per tri-state (box/dash/check), not color alone", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1, 2]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      // "all" state renders the checkmark polyline INSIDE the box, alongside
      // the box outline itself - shape, not color, still carries the signal.
      expect(header.querySelector("rect")).not.toBeNull();
      expect(header.querySelector("polyline")).not.toBeNull();
    });
  });

  describe("requirement 5 - selected work rows: no bold, accent tint instead", () => {
    it("does not bold a selected work row's title", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Alpha" });

      expect(option.className).not.toContain("font-semibold");
    });

    it("gives a selected work row the 8% accent background tint", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Alpha" });

      expect(option.className).toContain("bg-accent/8");
    });

    it("gives an unselected work row neither the bold text nor the accent tint", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Beta" });

      expect(option.className).not.toContain("font-semibold");
      expect(option.className).not.toContain("bg-accent/8");
    });
  });

  describe("requirement 8 - option-row hover/keyboard-highlight tint", () => {
    it("gives an unselected work row the neutral ink hover + keyboard-highlight classes", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Beta" });

      expect(option.className).toContain("hover:bg-ink/5");
      expect(option.className).toContain("[&.Mui-focused]:bg-ink/5");
    });

    it("gives the fandom-header row the same neutral ink hover + keyboard-highlight classes", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header.className).toContain("hover:bg-ink/5");
      expect(header.className).toContain("[&.Mui-focused]:bg-ink/5");
    });

    // A selected row's persistent bg-accent/8 tint and the transient neutral
    // hover:bg-ink/5 are mutually exclusive `background-color` values - the
    // plan requires a DEEPER accent hover on selected rows specifically, so
    // hovering a selected row doesn't visually erase its selected-state tint.
    it("gives a SELECTED work row a deeper accent hover instead of the neutral ink one", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const option = screen.getByRole("option", { name: "Alpha" });

      expect(option.className).toContain("hover:bg-accent/12");
      expect(option.className).toContain("[&.Mui-focused]:bg-accent/12");
      expect(option.className).not.toContain("hover:bg-ink/5");
    });
  });

  describe("requirement 4 - Autocomplete 'Clear' renamed to 'Clear all'", () => {
    it("names the clear control 'Clear all'", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
    });

    it("clicking 'Clear all' clears the entire selection", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker
          perWorkSeries={TWO_FANDOM_WORKS}
          selectedWorkIds={[1, 2]}
          onChange={onChange}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("does not render a clear control with nothing selected (nothing to clear)", () => {
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    });
  });
});
