import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkPicker } from "./WorkPicker";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Requirement 1, §1.7 ("Removing the popup-open machinery - verified safe"):
// the prior shipped design's controlled `open`/`onOpen`/`onClose` +
// `relatedTarget` override + `bulkSelectBarRef` + `onMouseDown`
// preventDefault existed SOLELY because the bulk-select bar was a DOM
// SIBLING of `<ul role="listbox">`. Now that the fandom header is a real
// tracked option (a listbox DESCENDANT), that machinery is dead weight -
// the plan calls for reverting to plain uncontrolled `open`, keeping only
// `disableCloseOnSelect`. This file is T9's dedicated coverage: proving
// there's no separate role="button" bulk-select bar anymore, AND that the
// popup's open/close behavior across both work and header selections still
// works correctly under uncontrolled `open` - i.e. removing the bar-specific
// workaround caused no regression.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
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

describe("WorkPicker: no separate bulk-select bar; uncontrolled popup-open (requirement 1, T9)", () => {
  it("has no role=button anywhere matching a select/deselect-all bulk-select bar", async () => {
    const user = userEvent.setup();
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    await openPicker(user);

    expect(
      screen.queryByRole("button", { name: /select all|deselect all/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the popup on clicking the combobox (uncontrolled open still works)", async () => {
    const user = userEvent.setup();
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await openPicker(user);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the popup open after selecting a work option (disableCloseOnSelect)", async () => {
    const user = userEvent.setup();
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    await openPicker(user);
    await user.click(screen.getByRole("option", { name: "Alpha" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the popup open after clicking a fandom-header option (the header is now a listbox descendant, not a sibling requiring special-case handling)", async () => {
    const user = userEvent.setup();
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    await openPicker(user);
    await user.click(screen.getByRole("option", { name: /fandom one/i }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes the popup on Escape (no leftover controlled-open override blocking normal close behavior)", async () => {
    const user = userEvent.setup();
    render(<WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />);

    await openPicker(user);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the popup when focus moves entirely outside the field (blur), matching MUI's default uncontrolled behavior", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <WorkPicker perWorkSeries={TWO_FANDOM_WORKS} selectedWorkIds={[]} onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    );

    await openPicker(user);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
