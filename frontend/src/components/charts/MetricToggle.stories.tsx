import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricToggle } from "./MetricToggle";

// Storybook coverage feeds the addon-a11y automated axe scan across the
// reusable role="tablist" segmented control (docs/plans/additional-metric-
// trend-charts.md §3.0/§3.4) in both its top-level and nested-sub-tab uses.
// Args-driven `render` (not raw `args`) since a real toggle needs live
// selectedKey/onChange state to demonstrate the panel swap - a plain args
// object would freeze the selection on whatever key the story sets.
const meta = {
  title: "Charts/MetricToggle",
  component: MetricToggle,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MetricToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

const TOP_LEVEL_TABS = [
  { key: "hits", label: "Hits" },
  { key: "kudos", label: "Kudos" },
  { key: "comments", label: "Comments" },
];

export const TopLevelMetricPicker: Story = {
  // args is required by Storybook's CSF3 types whenever the component has
  // required props, even though this story drives its own interactive
  // state from local useState rather than reading `args` (same pattern as
  // WorkPicker.stories.tsx/DateRangeSlider.stories.tsx, see TECH_DEBT.md's
  // 2026-08-03 entry).
  args: {
    label: "Metric",
    tabs: TOP_LEVEL_TABS,
    selectedKey: "hits",
    onChange: () => {},
    children: null,
  },
  render: () => {
    function Demo() {
      const [selectedKey, setSelectedKey] = useState("hits");
      return (
        <MetricToggle
          label="Metric"
          tabs={TOP_LEVEL_TABS}
          selectedKey={selectedKey}
          onChange={setSelectedKey}
        >
          <p className="p-4 text-sm text-ink-soft">Chart content for the "{selectedKey}" tab.</p>
        </MetricToggle>
      );
    }
    return <Demo />;
  },
};

const BOOKMARK_SUB_TABS = [
  { key: "byType", label: "By Type" },
  { key: "byWork", label: "By Work" },
];

// Demonstrates the nested-tablist use (plan §3.4/§6): a second MetricToggle
// inside a top-level one, matching how the Bookmarks tabpanel nests the
// [By Work | By Type] sub-toggle.
export const NestedBookmarksSubTab: Story = {
  args: {
    label: "Metric",
    tabs: [...TOP_LEVEL_TABS, { key: "bookmarks", label: "Bookmarks" }],
    selectedKey: "bookmarks",
    onChange: () => {},
    children: null,
  },
  render: () => {
    function Demo() {
      const [metric, setMetric] = useState("bookmarks");
      const [subTab, setSubTab] = useState("byType");
      return (
        <MetricToggle
          label="Metric"
          tabs={[...TOP_LEVEL_TABS, { key: "bookmarks", label: "Bookmarks" }]}
          selectedKey={metric}
          onChange={setMetric}
        >
          {metric === "bookmarks" ? (
            <MetricToggle
              label="Bookmark view"
              tabs={BOOKMARK_SUB_TABS}
              selectedKey={subTab}
              onChange={setSubTab}
            >
              <p className="p-4 text-sm text-ink-soft">Bookmarks "{subTab}" content.</p>
            </MetricToggle>
          ) : (
            <p className="p-4 text-sm text-ink-soft">Chart content for the "{metric}" tab.</p>
          )}
        </MetricToggle>
      );
    }
    return <Demo />;
  },
};
