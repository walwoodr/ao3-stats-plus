import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetricToggle } from "./MetricToggle";

// MetricToggle is the reusable role="tablist" segmented control introduced
// by docs/plans/additional-metric-trend-charts.md §3.0/§3.4 (T-I2) - used
// for BOTH the top-level metric picker (DashboardPage, WorkComparisonSection)
// AND the nested Bookmarks [By Work][By Type] sub-tab, so nested tablists
// share one tested implementation (plan §6).
//
// The plan doesn't pin down MetricToggle's exact prop contract (only its
// external behavior) - this is a routine Testing-stage judgment call, not a
// plan gap: a composite "tablist + owns its own tabpanel wrapper" API, so
// the component that owns the identity channel (nested Bookmarks sub-tab
// inside the outer tabpanel) composes cleanly. Assumed contract, exercised
// below:
//   <MetricToggle label="Metric" tabs={[{key,label}, ...]} selectedKey={k}
//     onChange={(key) => void}>
//     {panel content for the selected tab}
//   </MetricToggle>
// renders a `role="tablist"` (aria-label={label}) of `role="tab"` buttons
// plus one `role="tabpanel"` wrapping `children`, roving tabindex (only the
// selected tab is tabIndex 0), aria-selected reflecting `selectedKey`,
// Left/Right (wrapping) roving focus among tabs, Home/End jumping to the
// first/last tab, and Enter/Space on a focused tab both firing onChange AND
// moving DOM focus into the tabpanel (plan §6: "focus moving to the panel
// on select").
const TABS = [
  { key: "hits", label: "Hits" },
  { key: "kudos", label: "Kudos" },
  { key: "comments", label: "Comments" },
];

function renderToggle(selectedKey: string, onChange = vi.fn()) {
  render(
    <MetricToggle label="Metric" tabs={TABS} selectedKey={selectedKey} onChange={onChange}>
      <p>Panel content for {selectedKey}</p>
    </MetricToggle>,
  );
  return onChange;
}

describe("MetricToggle", () => {
  it("renders one role=tab per entry, inside a role=tablist labeled by the given label", () => {
    renderToggle("hits");

    const tablist = screen.getByRole("tablist", { name: "Metric" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Hits", "Kudos", "Comments"]);
  });

  it("marks exactly the selected tab aria-selected=true, the rest false", () => {
    renderToggle("kudos");

    expect(screen.getByRole("tab", { name: "Hits" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Kudos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute("aria-selected", "false");
  });

  it("gives only the selected tab tabIndex 0 (roving tabindex), the rest -1", () => {
    renderToggle("kudos");

    expect(screen.getByRole("tab", { name: "Hits" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Kudos" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute("tabindex", "-1");
  });

  it("renders a role=tabpanel containing the children, labelled by the selected tab", () => {
    renderToggle("hits");

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Panel content for hits")).toBeInTheDocument();
    const selectedTab = screen.getByRole("tab", { name: "Hits" });
    expect(panel).toHaveAttribute("aria-labelledby", selectedTab.id);
  });

  it("calls onChange with the clicked tab's key", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("hits");

    await user.click(screen.getByRole("tab", { name: "Kudos" }));

    expect(onChange).toHaveBeenCalledWith("kudos");
  });

  it("does not call onChange when clicking the already-selected tab", async () => {
    const user = userEvent.setup();
    const onChange = renderToggle("hits");

    await user.click(screen.getByRole("tab", { name: "Hits" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  describe("keyboard: roving focus (arrow keys move focus, not selection)", () => {
    it("ArrowRight moves focus to the next tab without calling onChange", async () => {
      const user = userEvent.setup();
      const onChange = renderToggle("hits");
      screen.getByRole("tab", { name: "Hits" }).focus();

      await user.keyboard("{ArrowRight}");

      expect(screen.getByRole("tab", { name: "Kudos" })).toHaveFocus();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ArrowRight wraps from the last tab to the first", async () => {
      const user = userEvent.setup();
      renderToggle("hits");
      screen.getByRole("tab", { name: "Comments" }).focus();

      await user.keyboard("{ArrowRight}");

      expect(screen.getByRole("tab", { name: "Hits" })).toHaveFocus();
    });

    it("ArrowLeft moves focus to the previous tab, wrapping from the first to the last", async () => {
      const user = userEvent.setup();
      renderToggle("hits");
      screen.getByRole("tab", { name: "Hits" }).focus();

      await user.keyboard("{ArrowLeft}");

      expect(screen.getByRole("tab", { name: "Comments" })).toHaveFocus();
    });

    it("Home moves focus to the first tab, End moves focus to the last tab", async () => {
      const user = userEvent.setup();
      renderToggle("hits");
      screen.getByRole("tab", { name: "Kudos" }).focus();

      await user.keyboard("{End}");
      expect(screen.getByRole("tab", { name: "Comments" })).toHaveFocus();

      await user.keyboard("{Home}");
      expect(screen.getByRole("tab", { name: "Hits" })).toHaveFocus();
    });
  });

  describe("keyboard: activation (Enter/Space select the focused tab)", () => {
    it("Enter on a focused, not-yet-selected tab calls onChange with its key", async () => {
      const user = userEvent.setup();
      const onChange = renderToggle("hits");
      screen.getByRole("tab", { name: "Hits" }).focus();
      await user.keyboard("{ArrowRight}");

      await user.keyboard("{Enter}");

      expect(onChange).toHaveBeenCalledWith("kudos");
    });

    it("Space on a focused, not-yet-selected tab calls onChange with its key", async () => {
      const user = userEvent.setup();
      const onChange = renderToggle("hits");
      screen.getByRole("tab", { name: "Hits" }).focus();
      await user.keyboard("{ArrowRight}{ArrowRight}");

      await user.keyboard(" ");

      expect(onChange).toHaveBeenCalledWith("comments");
    });

    // Plan §6: selecting a tab moves focus to its panel - proven here by
    // re-rendering with the new selectedKey (as the real onChange handler
    // in DashboardPage/WorkComparisonSection would do) and asserting focus
    // actually lands inside the panel, not just that onChange fired.
    it("moves focus into the tabpanel once the selection actually changes", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { rerender } = render(
        <MetricToggle label="Metric" tabs={TABS} selectedKey="hits" onChange={onChange}>
          <p>Panel content for hits</p>
        </MetricToggle>,
      );
      screen.getByRole("tab", { name: "Hits" }).focus();
      await user.keyboard("{ArrowRight}{Enter}");

      rerender(
        <MetricToggle label="Metric" tabs={TABS} selectedKey="kudos" onChange={onChange}>
          <p>Panel content for kudos</p>
        </MetricToggle>,
      );

      expect(screen.getByRole("tabpanel")).toHaveFocus();
    });

    it("does not move focus to the panel from arrow-key roving alone (no selection change)", async () => {
      const user = userEvent.setup();
      renderToggle("hits");
      screen.getByRole("tab", { name: "Hits" }).focus();

      await user.keyboard("{ArrowRight}");

      expect(screen.getByRole("tabpanel")).not.toHaveFocus();
    });
  });

  it("supports a generic string key type at the call site (compile-time; e.g. a union of metric names)", () => {
    const onChange = vi.fn<(key: "byWork" | "byType") => void>();
    render(
      <MetricToggle
        label="Bookmark view"
        tabs={[
          { key: "byType", label: "By Type" },
          { key: "byWork", label: "By Work" },
        ]}
        selectedKey="byType"
        onChange={onChange}
      >
        <p>By Type content</p>
      </MetricToggle>,
    );

    expect(screen.getByRole("tab", { name: "By Type" })).toHaveAttribute("aria-selected", "true");
  });
});
