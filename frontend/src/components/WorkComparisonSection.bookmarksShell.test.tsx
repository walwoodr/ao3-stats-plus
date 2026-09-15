import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Bookmarks sub-tab shell (docs/plans/additional-metric-trend-charts.md
// §3.4, Testing task T-T5): selecting the top-level Bookmarks metric tab
// reveals a SECOND, nested role="tablist" [By Work | By Type], reusing
// MetricToggle (nested tablists are valid ARIA per plan §6). This file
// covers only the shell (roles, nesting, default, panel swap) - the By-Type
// checkbox-group content and By-Work per-work charts have their own sibling
// files (.bookmarksByType.test.tsx / .bookmarksByWork.test.tsx, T-T6/T-T7).
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    bookmarks: [],
    ...overrides,
  };
}

function renderSection(props: { perWorkSeries: PerWorkSeries[]; earliestPostYear: number | null }) {
  return render(<WorkComparisonSection {...props} username={USERNAME} />);
}

async function selectWorkViaCombobox(user: ReturnType<typeof userEvent.setup>, title: string) {
  if (!screen.queryByRole("listbox")) {
    await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
  }
  await user.click(screen.getByRole("option", { name: title }));
}

async function goToBookmarksTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Bookmarks" }));
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

const ONE_WORK: PerWorkSeries[] = [
  work({
    ao3WorkId: 1,
    title: "Work One",
    fandoms: "Fandom A",
    points: [
      {
        capturedOn: "2026-01-01",
        hits: 10,
        kudos: 1,
        comments: 2,
        bookmarks: 4,
        subscriptions: 1,
        publicBookmarks: 3,
        privateBookmarks: 1,
      },
    ],
  }),
];

describe("WorkComparisonSection: Bookmarks sub-tab shell", () => {
  it("reveals a nested role=tablist [By Type | By Work] once the Bookmarks tab is selected", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });

    await goToBookmarksTab(user);

    const tablists = screen.getAllByRole("tablist");
    expect(tablists).toHaveLength(2);
    const subTablist = tablists[1];
    const subTabs = within(subTablist).getAllByRole("tab");
    expect(subTabs.map((tab) => tab.textContent)).toEqual(["By Type", "By Work"]);
  });

  it("does not render the sub-tablist before the Bookmarks tab is selected", () => {
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });

    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "By Type" })).not.toBeInTheDocument();
  });

  it("defaults to the By Type sub-tab selected", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });

    await goToBookmarksTab(user);

    expect(screen.getByRole("tab", { name: "By Type" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "By Work" })).toHaveAttribute("aria-selected", "false");
  });

  // Plan §6: "the sub-tablist is nested inside the Bookmarks tabpanel" -
  // proven structurally, not just by both existing somewhere on the page.
  it("nests the sub-tablist inside the top-level Bookmarks tabpanel", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });

    await goToBookmarksTab(user);

    const bookmarksTab = screen.getByRole("tab", { name: "Bookmarks" });
    const outerPanel = screen
      .getAllByRole("tabpanel")
      .find((panel) => panel.getAttribute("aria-labelledby") === bookmarksTab.id);
    expect(outerPanel).toBeDefined();
    expect(
      within(outerPanel as HTMLElement).getByRole("tablist", { name: /by type|by work|bookmark/i }),
    ).toBeInTheDocument();
  });

  it("the top-level and nested tablists have distinct accessible names", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });

    await goToBookmarksTab(user);

    const [topTablist, subTablist] = screen.getAllByRole("tablist");
    expect(topTablist.getAttribute("aria-label")).not.toEqual(
      subTablist.getAttribute("aria-label"),
    );
  });

  it("clicking By Work selects it and swaps the sub-panel's aria-labelledby", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });
    await goToBookmarksTab(user);

    await user.click(screen.getByRole("tab", { name: "By Work" }));

    expect(screen.getByRole("tab", { name: "By Work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "By Type" })).toHaveAttribute("aria-selected", "false");
    const subTabpanel = screen.getAllByRole("tabpanel")[1];
    expect(subTabpanel).toHaveAttribute(
      "aria-labelledby",
      screen.getByRole("tab", { name: "By Work" }).id,
    );
  });

  describe("keyboard nav on the nested sub-tablist", () => {
    it("only the selected sub-tab has tabIndex 0 (roving tabindex)", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });
      await goToBookmarksTab(user);

      expect(screen.getByRole("tab", { name: "By Type" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tab", { name: "By Work" })).toHaveAttribute("tabindex", "-1");
    });

    it("ArrowRight then Enter on the nested tablist selects By Work via the keyboard", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: ONE_WORK, earliestPostYear: null });
      await goToBookmarksTab(user);

      screen.getByRole("tab", { name: "By Type" }).focus();
      await user.keyboard("{ArrowRight}{Enter}");

      expect(screen.getByRole("tab", { name: "By Work" })).toHaveAttribute("aria-selected", "true");
    });
  });

  // Plan corner case §4.6: switching top-level metric tabs (or the sub-tab)
  // must not reset selection/range - they live in the persisted store, not
  // per-tab state, distinct from the sub-tab/checkbox states themselves
  // (§4.5, explicitly ephemeral/allowed to reset).
  it("navigating into the Bookmarks tab and back out preserves the selected works and range", async () => {
    const user = userEvent.setup();
    const worksWithThreeUnionPoints: PerWorkSeries[] = [
      ...ONE_WORK,
      work({
        ao3WorkId: 2,
        title: "Work Two",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2020-01-01",
            hits: 1,
            kudos: 1,
            comments: 1,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
          {
            capturedOn: "2021-01-01",
            hits: 2,
            kudos: 1,
            comments: 1,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
        ],
      }),
    ];
    renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    await goToBookmarksTab(user);
    await user.click(screen.getByRole("tab", { name: "Hits" }));

    expect(useWorkComparisonStore.getState().getSelection(USERNAME)).toEqual([1, 2]);
  });
});
