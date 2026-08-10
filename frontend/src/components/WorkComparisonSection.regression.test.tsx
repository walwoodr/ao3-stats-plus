import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

function renderSection(props: { perWorkSeries: PerWorkSeries[]; earliestPostYear: number | null }) {
  return render(<WorkComparisonSection {...props} username={USERNAME} />);
}

// MUI's Autocomplete toggles the popup closed on a second click of an
// already-open, already-focused input - only click to open if not already
// open, so a second call in the same test doesn't accidentally close it.
async function selectWorkViaCombobox(user: ReturnType<typeof userEvent.setup>, title: string) {
  if (!screen.queryByRole("listbox")) {
    await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
  }
  await user.click(screen.getByRole("option", { name: title }));
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

// Regression for TECH_DEBT.md (2026-08-03): `range` was only ever reset to
// null when the selection dropped *below* the >2 union-points gate - never
// reconciled against a live `domain` that shifts while staying *above* the
// gate. This drives the selection through exactly that path (never dipping
// to <= 2 union points, so the old gate-based reset never fires) and
// asserts the newly-selected work's own points actually reach the chart,
// rather than being silently filtered out by a stale window. Interaction
// mechanism updated to the combobox (docs/plans/work-comparison-picker-
// redesign.md T9(a)) - the regression assertion itself is unchanged.
describe("stale range window across a selection swap (regression)", () => {
  it("re-clamps the window against the live domain instead of leaving a stale narrowed range applied", async () => {
    const user = userEvent.setup();
    const worksWithDisjointRanges: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Early",
        fandoms: "Fandom A",
        points: [
          { capturedOn: "2018-01-01", hits: 10, kudos: 1 },
          { capturedOn: "2018-06-01", hits: 20, kudos: 2 },
          { capturedOn: "2019-01-01", hits: 30, kudos: 3 },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Late",
        fandoms: "Fandom A",
        points: [
          { capturedOn: "2023-01-01", hits: 100, kudos: 10 },
          { capturedOn: "2024-01-01", hits: 200, kudos: 20 },
          { capturedOn: "2025-01-01", hits: 300, kudos: 30 },
        ],
      }),
    ];

    renderSection({ perWorkSeries: worksWithDisjointRanges, earliestPostYear: null });

    // "Work Early" alone already clears the >2 union-points gate (3
    // points), so the slider is mounted from the default 1-selected state.
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

    // Narrow the window down to Work Early's own span - excludes Work
    // Late's 2023-2025 points entirely.
    const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });
    const initialEnd = Number(endThumb.getAttribute("aria-valuenow"));
    endThumb.focus();
    for (let year = initialEnd; year > 2019; year--) {
      await user.keyboard("{ArrowLeft}");
    }
    expect(screen.getByText(/2018\s*[–-]\s*2019/)).toBeInTheDocument();

    // Add Work Late (union points stay well above the gate throughout),
    // then drop Work Early - leaving only Work Late selected. Work Late
    // alone still clears the gate (3 points), so the slider stays mounted
    // and the selection never dips to <= 2 union points, meaning the old
    // gate-drop reset never fires even though the domain has shifted.
    await selectWorkViaCombobox(user, "Work Late");
    await selectWorkViaCombobox(user, "Work Early");

    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    // Without a live re-clamp against the current domain, Work Late's
    // 2023-2025 points are all silently filtered out by the stale
    // [2018, 2019] window - this should not happen.
    expect(within(hitsFigure).queryByText(/work late.*2024-01-01/i)).toBeInTheDocument();
  });
});

// Regression for TECH_DEBT.md (2026-08-03): the role="status" "Comparing N
// works, START to END." summary used to derive its year span from the full
// unfiltered union of the selected works' captured dates, never from the
// currently-applied DateRangeSlider window - so narrowing the visible range
// changed the charts but not what was announced to screen readers. Fixed to
// report the currently-active (possibly narrowed) range, matching what's
// actually shown.
describe("comparison summary reports the active windowed range, not the full data span (regression)", () => {
  it("updates the announced year span when the date-range slider is narrowed", async () => {
    const user = userEvent.setup();
    const singleWorkWideSpan: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Only",
        fandoms: "Fandom A",
        points: [
          { capturedOn: "2018-01-01", hits: 10, kudos: 1, comments: 0, bookmarks: 0, subscriptions: 0 },
          { capturedOn: "2020-01-01", hits: 20, kudos: 2, comments: 0, bookmarks: 0, subscriptions: 0 },
          { capturedOn: "2025-01-01", hits: 30, kudos: 3, comments: 0, bookmarks: 0, subscriptions: 0 },
        ],
      }),
    ];

    renderSection({ perWorkSeries: singleWorkWideSpan, earliestPostYear: null });

    expect(screen.getByRole("status")).toHaveTextContent(/2018 to 2025/);

    const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });
    const initialEnd = Number(endThumb.getAttribute("aria-valuenow"));
    endThumb.focus();
    for (let year = initialEnd; year > 2020; year--) {
      await user.keyboard("{ArrowLeft}");
    }

    expect(screen.getByRole("status")).toHaveTextContent(/2018 to 2020/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/2018 to 2025/);
  });
});
