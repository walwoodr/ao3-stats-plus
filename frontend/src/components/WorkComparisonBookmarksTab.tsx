import { useState } from "react";
import type { PerWorkPoint } from "../queries/useStatsForUser";
import { BOOKMARK_TYPES, type BookmarkTypeKey } from "../lib/perWorkMetrics";
import { MetricToggle } from "./charts/MetricToggle";
import { MultiSeriesTrendChart, type SeriesDatum } from "./charts/MultiSeriesTrendChart";

// Bookmarks sub-interaction (docs/plans/additional-metric-trend-charts.md
// §3.4, T-I8/T-I9): a nested [By Type | By Work] sub-tablist (reusing
// MetricToggle - nested tablists are valid ARIA, plan §6), rendered inside
// the top-level Bookmarks tabpanel. Both sub-views pull from the same
// total/public/private data via the two builder callbacks WorkComparison-
// Section supplies (keeps the zero-basis-leadIn/window-filtering/style-slot
// derivations in one place rather than duplicated here).
const BOOKMARK_SUB_TABS = [
  { key: "byType", label: "By Type" },
  { key: "byWork", label: "By Work" },
];

export interface WorkComparisonBookmarksTabProps {
  // By-Type builder: keeps every currently-selected work's series entry
  // (even with 0 points after null-filtering) so the accessible table still
  // shows a "-" gap column for an unenriched work, rather than dropping it.
  buildTypeSeries: (valueOf: (point: PerWorkPoint) => number | null, applyLeadIn: boolean) => SeriesDatum[];
}

const DEFAULT_CHECKED: Record<BookmarkTypeKey, boolean> = {
  total: true,
  public: false,
  private: false,
};

function ByType({
  buildTypeSeries,
  checked,
  onToggle,
}: {
  buildTypeSeries: WorkComparisonBookmarksTabProps["buildTypeSeries"];
  checked: Record<BookmarkTypeKey, boolean>;
  onToggle: (key: BookmarkTypeKey) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="text-sm font-semibold text-ink">Bookmark types</legend>
        {BOOKMARK_TYPES.map((type) => (
          <label key={type.key} className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={checked[type.key]} onChange={() => onToggle(type.key)} />
            {type.label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-8">
        {BOOKMARK_TYPES.filter((type) => checked[type.key]).map((type) => {
          const series = buildTypeSeries(type.valueOf, type.applyLeadIn);
          const hasData = series.some((s) => s.points.length > 0);
          // Corner case §4.2: a checked type with zero data across every
          // currently selected work would otherwise render a blank chart
          // frame (MultiSeriesTrendChart only short-circuits on
          // series.length === 0, not "every series is empty").
          if (!hasData) {
            return (
              <p key={type.key} className="text-sm text-ink-soft">
                {`No ${type.label.toLowerCase()} bookmark data captured yet for the selected works.`}
              </p>
            );
          }
          return (
            <MultiSeriesTrendChart
              key={type.key}
              title={`${type.label} bookmarks`}
              valueLabel="Bookmarks"
              series={series}
            />
          );
        })}
      </div>
    </div>
  );
}

// By-Work content lands in the next task item (T-I9); this keeps the
// [By Type | By Work] shell + By-Type (T-I8's own scope) wired and
// testable in isolation.
function ByWork() {
  return <p className="text-sm text-ink-soft">Loading By-Work view...</p>;
}

export function WorkComparisonBookmarksTab({
  buildTypeSeries,
}: WorkComparisonBookmarksTabProps) {
  // Ephemeral view state (plan §3.4/§4.5) - not persisted; switching away
  // from and back to Bookmarks, or a remount, may reset these, unlike
  // selection/range which live in the store.
  const [subTab, setSubTab] = useState("byType");
  const [checked, setChecked] = useState(DEFAULT_CHECKED);

  function toggleType(key: BookmarkTypeKey) {
    setChecked((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  return (
    <MetricToggle label="Bookmark view" tabs={BOOKMARK_SUB_TABS} selectedKey={subTab} onChange={setSubTab}>
      {subTab === "byType" ? (
        <ByType buildTypeSeries={buildTypeSeries} checked={checked} onToggle={toggleType} />
      ) : (
        <ByWork />
      )}
    </MetricToggle>
  );
}
