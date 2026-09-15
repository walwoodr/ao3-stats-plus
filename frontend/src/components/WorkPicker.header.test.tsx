import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Requirement 1 (the plan's load-bearing decision, §1): the fandom header is
// a genuine SYNTHETIC `role="option"` entry in the `options` array MUI
// tracks (Option A - verified against useAutocomplete.js: only tracked
// options get `data-option-index`/`tabIndex=-1` from `getOptionProps`, which
// is what makes them reachable by arrow-key roving highlight and Enter -
// see the plan's §1.1). This is NOT the prior shipped design's
// `role="button"` bulk-select bar rendered as a listbox sibling - that
// design (and its controlled open/onClose/relatedTarget machinery) is
// removed; see WorkPicker.popupOpen.test.tsx for the accompanying
// open-state regression coverage (T9).
//
// Requirement 6 (§6) restyles the header itself: bold, body-sized text, no
// visible "None/Some/All selected" status text (that status now lives only
// in the option's `aria-label`, for screen readers - §Accessibility), and
// the group divider moves from below the header to above it.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    bookmarks: [],
    ...overrides,
  };
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

// Both `border-t` and Tailwind's `first:border-t-0` variant are applied to
// EVERY group wrapper uniformly (per the plan's literal §6 class string) -
// the "except the first group" effect is a real CSS pseudo-class
// (`:first-child`) that jsdom's unit-test rendering doesn't apply actual
// stylesheet cascade for, so this asserts the utility-class CONTRACT the
// plan specifies rather than a computed style jsdom can't produce here (see
// the plan's alternative "compute first-visible-fandom index" phrasing,
// which this class-token assertion is agnostic to - it holds either way).
function groupWrapperFor(headerOption: HTMLElement): HTMLElement | null {
  return headerOption.closest('[role="group"]');
}

describe("WorkPicker: fandom header as a synthetic role=option (requirement 1)", () => {
  describe("rendering (requirement 6 restyle)", () => {
    it("renders the fandom header as a role=option row, not a role=button", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header.tagName).toBe("LI");
      expect(header).toHaveAttribute("role", "option");
      expect(screen.queryByRole("button", { name: /fandom one/i })).not.toBeInTheDocument();
    });

    it("is bold and body-sized (text-sm font-semibold), not the old text-xs/uppercase status style", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header.className).toContain("font-semibold");
      expect(header.className).toContain("text-sm");
      expect(header.className).not.toContain("text-xs");
      expect(header.className).not.toContain("uppercase");
    });

    it("shows the plain fandom name but drops the old visible 'None/Some/All selected' status text", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header).toHaveTextContent("Fandom One");
      expect(header).not.toHaveTextContent(/none selected/i);
      expect(header).not.toHaveTextContent(/some selected/i);
      expect(header).not.toHaveTextContent(/all selected/i);
    });

    it("has aria-selected=false always, since a header never enters the Autocomplete value", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1, 2]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      // Fandom One is FULLY selected here - if aria-selected reflected the
      // tri-state icon instead of `value` membership, this would (wrongly)
      // read "true".
      expect(getFandomHeaderOption("fandom one")).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("click semantics (unchanged from the prior bulk-select-bar buttons)", () => {
    it("clicking a none-selected fandom's header selects all its works", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(getFandomHeaderOption("fandom one"));

      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2]));
      expect(onChange.mock.calls[0][0]).toHaveLength(2);
    });

    it("clicking a fully-selected fandom's header deselects all its works", async () => {
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

    it("clicking a partially-selected fandom's header fills it to 100% rather than deselecting", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.click(getFandomHeaderOption("fandom one"));

      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2]));
      expect(onChange.mock.calls[0][0]).toHaveLength(2);
    });
  });

  describe("keyboard operability (§1.1's verified finding - the load-bearing guard)", () => {
    it("reaches the header option via ArrowDown from the closed-then-opened combobox", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.keyboard("{ArrowDown}");

      const header = getFandomHeaderOption("fandom one");
      // MUI stamps BOTH the DOM class (imperatively, via classList.add - see
      // useAutocomplete.js's syncHighlightedIndexToDOM) and the combobox's
      // aria-activedescendant when a TRACKED option (one with
      // data-option-index) is highlighted - a manually-injected header
      // outside the options array would get neither.
      expect(header).toHaveClass("Mui-focused");
      expect(getCombobox()).toHaveAttribute("aria-activedescendant", header.id);
    });

    it("toggles the fandom on Enter once the header option is keyboard-highlighted", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={onChange} />,
      );

      await openPicker(user);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([1, 2]));
      expect(onChange.mock.calls[0][0]).toHaveLength(2);
    });

    it("keeps arrow-key navigation moving through work options after the header (full parity, not header-only)", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      await user.keyboard("{ArrowDown}"); // Fandom One header
      await user.keyboard("{ArrowDown}"); // Alpha

      const alpha = screen.getByRole("option", { name: "Alpha" });
      expect(alpha).toHaveClass("Mui-focused");
      expect(getCombobox()).toHaveAttribute("aria-activedescendant", alpha.id);
    });
  });

  describe("tri-state status via aria-label (screen-reader carrier for the removed visible text)", () => {
    it("labels a none-selected fandom header with 'no works selected' + a select-all action", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const ariaLabel = getFandomHeaderOption("fandom one").getAttribute("aria-label") ?? "";

      expect(ariaLabel).toMatch(/no works selected/i);
      expect(ariaLabel).toMatch(/select all/i);
    });

    it("labels a fully-selected fandom header with 'all works selected' + a deselect-all action", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1, 2]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const ariaLabel = getFandomHeaderOption("fandom one").getAttribute("aria-label") ?? "";

      expect(ariaLabel).toMatch(/all works selected/i);
      expect(ariaLabel).toMatch(/deselect all/i);
    });

    it("labels a partially-selected fandom header with 'some works selected' + a select-remaining action", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[1]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const ariaLabel = getFandomHeaderOption("fandom one").getAttribute("aria-label") ?? "";

      expect(ariaLabel).toMatch(/some works selected/i);
      expect(ariaLabel).toMatch(/select all remaining|select the remaining/i);
    });

    it("names the header option by its aria-label (accessible name), not just the bare fandom text", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header).toHaveAccessibleName(/no works selected/i);
    });
  });

  // Requirement 6: divider moves ABOVE the header (replacing the old
  // border-b below it), with no stray line above the very first group.
  describe("above-header divider (requirement 6)", () => {
    it("gives every fandom group's wrapper the top-divider utility classes", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const fandomOneWrapper = groupWrapperFor(getFandomHeaderOption("fandom one"));
      const fandomTwoWrapper = groupWrapperFor(getFandomHeaderOption("fandom two"));

      expect(fandomOneWrapper).not.toBeNull();
      expect(fandomTwoWrapper).not.toBeNull();
      [fandomOneWrapper, fandomTwoWrapper].forEach((wrapper) => {
        expect(wrapper?.className).toContain("border-t");
        expect(wrapper?.className).toContain("first:border-t-0");
      });
    });

    it("does not reintroduce the old below-header border-b divider", async () => {
      const user = userEvent.setup();
      render(
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />,
      );

      await openPicker(user);
      const header = getFandomHeaderOption("fandom one");

      expect(header.className).not.toContain("border-b");
    });
  });
});
