import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import { useStatsForUser } from "../queries/useStatsForUser";

// Testing task T8 (docs/plans/date-range-slider-month-granularity.md §10,
// D5 LOCKED): the three account-level TrendChart instances (Total hits/
// kudos/Subscribers) stop being passed the `leadIn` prop by default,
// routing them through computeYDomain's existing (already-shipped)
// lead-in-LESS branch - floor lifts off 0 with the break-indicator glyph
// for a 2+-snapshot account; a single-snapshot account now shows "not
// enough history yet" instead of a lone dot (the `notEnoughHistory` gate
// drops its `!hasLeadIn &&` guard). Split into its own file (mirrors
// DashboardPage.metricToggle.test.tsx's own split) both for the per-concern
// convention this codebase already uses and because DashboardPage.test.tsx
// is already at its 500-line .tsx budget ceiling (pre-existing, unrelated
// to this change - flagged, not fixed here).
vi.mock("../store/useTokenFromUrl");
vi.mock("../queries/useStatsForUser");

// Mirrors TrendChart.dateGroupingWiring.test.tsx's own polyfill: Recharts'
// ResponsiveContainer needs real (non-zero) layout dimensions before
// ActivePointOverlay's usePlotArea/useXAxisScale/useYAxisScale hooks (and
// therefore the y-axis-break-glyph) resolve to anything renderable.
function installRechartsSizePolyfill() {
  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 600, height: 240 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }

  const originalResizeObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );

  beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 600 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 240,
    });
  });

  afterAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/u/someauthor"]}>
      <Routes>
        <Route path="/u/:username" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockStats(overrides: Partial<ReturnType<typeof useStatsForUser>>) {
  vi.mocked(useStatsForUser).mockReturnValue({
    data: undefined,
    error: null,
    isLoading: false,
    ...overrides,
  } as ReturnType<typeof useStatsForUser>);
}

const TWO_POINT_SERIES = [
  {
    capturedOn: "2026-01-01",
    totalHits: 10,
    totalKudos: 1,
    kudosToHitsRatio: 0.1,
    totalUserSubscriptions: 3,
  },
  {
    capturedOn: "2026-01-08",
    totalHits: 20,
    totalKudos: 3,
    kudosToHitsRatio: 0.15,
    totalUserSubscriptions: 5,
  },
];

function mockPopulated(earliestPostYear: number | null) {
  vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
  mockStats({
    data: {
      statsForUser: {
        kudosToHitsRatio: 0.12,
        aggregateSeries: TWO_POINT_SERIES,
        perWorkSeries: [],
        earliestPostYear,
      },
    },
  });
}

beforeEach(() => {
  useTokenStore.setState({ tokensByUsername: {} });
  window.localStorage.removeItem("ao3-stats-plus-work-comparison-store");
  useWorkComparisonStore.setState({ byUsername: {} });
});

describe("DashboardPage: account-level lead-in hidden by default (D5, LOCKED)", () => {
  installRechartsSizePolyfill();

  it("lifts the Y-axis floor off 0 and shows the break-indicator glyph on the Hits chart for a 2+-snapshot account (D5's lead-in-less branch)", () => {
    mockPopulated(2020);
    const { container } = renderDashboard();

    // computeYDomain's existing dataMin>0 branch (chart-axis-comparison-
    // and-table-orientation-batch.md D1) - already shipped, exercised here
    // via the ABSENCE of the leadIn prop rather than any new axis logic.
    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(1);
  });

  it("lifts the Y-axis floor off 0 on the Kudos chart too", async () => {
    const user = userEvent.setup();
    mockPopulated(2020);
    const { container } = renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Kudos" }));

    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(1);
  });

  it("lifts the Y-axis floor off 0 on the Subscribers chart too", async () => {
    const user = userEvent.setup();
    mockPopulated(2020);
    const { container } = renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Subscribers" }));

    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(1);
  });

  // Corner case §10 ("Two+ real snapshots"): explicitly contrasts with the
  // single-snapshot gate below - 2+ real snapshots render normally (no
  // "not enough history" message), just with the floor lifted.
  it("does not show the 'not enough history' message for a 2+-snapshot account", () => {
    mockPopulated(2020);
    renderDashboard();

    expect(screen.queryByText(/only have one|not enough history yet/i)).not.toBeInTheDocument();
  });

  // Corner case §10 ("Single real snapshot"): with the lead-in no longer
  // drawing a minimal two-point (lead-in -> snapshot) line, one real
  // snapshot is a lone dot, not a trend - notEnoughHistory drops its old
  // `!hasLeadIn &&` guard and becomes unconditional on
  // `aggregateSeries.length === 1`.
  it("shows 'not enough history yet' for a single real snapshot, even with a valid earliestPostYear (new gate)", () => {
    vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
    mockStats({
      data: {
        statsForUser: {
          kudosToHitsRatio: 0.1,
          aggregateSeries: [TWO_POINT_SERIES[0]],
          perWorkSeries: [],
          earliestPostYear: 2020,
        },
      },
    });

    renderDashboard();

    expect(screen.getByText(/only have one|not enough history yet/i)).toBeInTheDocument();
  });

  // No `earliestPostYear`/no lead-in ever (§10 corner case): unchanged -
  // there was no lead-in to exclude, so the dataMin>0 branch already
  // applied before this change too. Included here as an explicit control.
  it("still lifts the Y-axis floor when there was never an eligible leadIn at all (earliestPostYear null)", () => {
    mockPopulated(null);
    const { container } = renderDashboard();

    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(1);
  });
});
