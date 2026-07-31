import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallPage } from "./InstallPage";

// InstallPage explains the bookmarklet, offers a draggable javascript: loader
// link (not keyboard-operable by nature), and per the plan MUST also offer a
// keyboard-accessible fallback (a copyable code block) since dragging isn't.
describe("InstallPage", () => {
  it("renders a draggable javascript: bookmarklet link", () => {
    render(<InstallPage />);

    const bookmarkletLink = screen.getByRole("link", { name: /ao3 stats/i });
    expect(bookmarkletLink.getAttribute("href")).toMatch(/^javascript:/);
  });

  it("provides a keyboard-accessible fallback that reveals the bookmarklet code", async () => {
    const user = userEvent.setup();
    render(<InstallPage />);

    const toggle = screen.getByRole("button", { name: /show.*code|copy.*code/i });
    await user.tab();
    // The fallback toggle must be reachable/operable purely via keyboard.
    await user.keyboard("{Enter}");

    expect(toggle).toBeInTheDocument();
    expect(screen.getByText(/javascript:/i)).toBeInTheDocument();
  });

  it("lets a keyboard user copy the fallback code without dragging anything", async () => {
    // userEvent.setup() (also called by an earlier test in this file)
    // replaces navigator.clipboard with its own getter-only stub - a plain
    // Object.assign(navigator, { clipboard: ... }) throws against that
    // ("Cannot set property clipboard... which has only a getter"), so
    // this spies on the stub's own writeText instead of hand-rolling a
    // replacement object.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InstallPage />);

    await user.click(screen.getByRole("button", { name: /show.*code|copy.*code/i }));
    const copyButton = screen.getByRole("button", { name: /copy/i });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalled();
  });

  it("explains that dragging the link to the bookmarks bar installs it", () => {
    render(<InstallPage />);

    expect(screen.getByText(/drag/i)).toBeInTheDocument();
  });
});
