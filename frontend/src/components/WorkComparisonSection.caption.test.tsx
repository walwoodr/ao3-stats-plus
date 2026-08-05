import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Testing task 8 (docs/plans/per-work-zero-basis-dates.md, section 7): a
// short visible caption renders beneath the chart pair (Hits, Kudos) reading
// "Dashed segments show the period before your first captured stats for a
// work." whenever >=1 currently selected/visible work has a rendered
// lead-in, and is hidden entirely when zero lead-ins are currently
// rendered. Assertions are unchanged by the picker/state-store redesign
// (docs/plans/work-comparison-picker-redesign.md T9(e)) - only the
// selection interaction mechanism (checkbox -> combobox) and the
// now-required `username` prop / store reset are new here.
const CAPTION_TEXT = /dashed segments show the period before your first captured stats for a work/i;
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    publishedOn: null,
    ...overrides,
  };
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

describe("WorkComparisonSection: visible lead-in caption", () => {
  it("renders the caption when the default single selected work has a rendered leadIn", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("does not render the caption when no selected work has a leadIn (no publishedOn, no earliestPostYear)", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("appears once at least one additionally-selected work has a leadIn, even if the first selected work doesn't", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 2, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();

    await selectWorkViaCombobox(user, "Work Two");

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("hides the caption again once the only work with a leadIn is deselected", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 2, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    await selectWorkViaCombobox(user, "Work One");

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  // Corner case (plan section 4): zooming the slider past every currently
  // selected work's publish year drops every leadIn as a display-window
  // consequence - the caption must follow suit and disappear, even though
  // the underlying data still technically has a zero-basis for each work.
  it("hides the caption once the slider window is narrowed past every selected work's publish year", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2010-01-01",
        points: [
          { capturedOn: "2015-01-01", hits: 1, kudos: 1 },
          { capturedOn: "2018-01-01", hits: 2, kudos: 1 },
          { capturedOn: "2020-01-01", hits: 3, kudos: 1 },
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    // 3 own points already clear the >2 union-points slider gate. Domain
    // start is the earliest union captured date (2015) - narrow past the
    // work's 2010 publish year.
    const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
    startThumb.focus();
    for (let year = 2015; year < 2019; year++) {
      await user.keyboard("{ArrowRight}");
    }
    expect(screen.getByText(/2019\s*[–-]/)).toBeInTheDocument();

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("renders the caption exactly once, not once per chart (Hits + Kudos)", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.getAllByText(CAPTION_TEXT)).toHaveLength(1);
  });

  it("does not render the caption at all with zero works selected", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work One");

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });
});
