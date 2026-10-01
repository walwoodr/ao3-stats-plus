import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkComparisonStore } from "./useWorkComparisonStore";
import { MAX_SELECTED_WORKS } from "../lib/comparisonSelection";

// useWorkComparisonStore is the persisted per-username store that moves
// `selectedWorkIds`/`range` out of WorkComparisonSection's local useState
// (docs/plans/work-comparison-picker-redesign.md §2.1 - the STABLE contract
// the deferred bookmarks/comments/subscriptions work builds against).
// Follows useTokenStore.ts's exact convention: create()(persist(...)),
// byUsername map, localStorage. Every mutation action must delegate to
// comparisonSelection.ts's existing pure functions rather than reimplement
// selection semantics - these tests assert delegation via its observable
// effects (cap enforcement, de-dup, truncation reporting), not by mocking
// the pure functions.
describe("useWorkComparisonStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkComparisonStore.setState({ byUsername: {} });
  });

  describe("reads: default state for a username never seen before", () => {
    it("getSelection returns an empty array", () => {
      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([]);
    });

    it("getRange returns null", () => {
      expect(useWorkComparisonStore.getState().getRange("someauthor")).toBeNull();
    });

    // Concrete regression guard, not a hypothetical: a naive
    // `byUsername[username] ?? { selectedWorkIds: [], range: null }`
    // fallback allocates a NEW array/object on every call. Since
    // WorkComparisonSection reads this store via a
    // `useWorkComparisonStore((state) => state.getSelection(username))`
    // selector (React's `useSyncExternalStore` under the hood), a
    // non-referentially-stable empty-state snapshot fails React's
    // Object.is snapshot-stability check and produces an infinite render
    // loop ("The result of getSnapshot should be cached") - confirmed
    // against a Testing-stage reference implementation, not a hypothetical
    // concern.
    it("returns a referentially-stable empty selection array across repeated calls for the same unseen username", () => {
      const first = useWorkComparisonStore.getState().getSelection("neverseen");
      const second = useWorkComparisonStore.getState().getSelection("neverseen");

      expect(first).toBe(second);
    });
  });

  describe("per-username isolation", () => {
    it("keeps selection and range independent across usernames", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("authorA", [1, 2]);
      store.setSelection("authorB", [9]);
      store.setRange("authorA", { start: 2020, end: 2022 });

      expect(useWorkComparisonStore.getState().getSelection("authorA")).toEqual([1, 2]);
      expect(useWorkComparisonStore.getState().getSelection("authorB")).toEqual([9]);
      expect(useWorkComparisonStore.getState().getRange("authorA")).toEqual({
        start: 2020,
        end: 2022,
      });
      expect(useWorkComparisonStore.getState().getRange("authorB")).toBeNull();
    });

    it("addWork for one username never affects another username's selection", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("authorA", [1]);

      useWorkComparisonStore.getState().addWork("authorB", 5);

      expect(useWorkComparisonStore.getState().getSelection("authorA")).toEqual([1]);
      expect(useWorkComparisonStore.getState().getSelection("authorB")).toEqual([5]);
    });
  });

  describe("setSelection / setRange / clearSelection", () => {
    it("setSelection replaces the whole selected-ids array", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);
      store.setSelection("someauthor", [4]);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([4]);
    });

    it("setRange stores the window unclamped/as-given (raw, per §2.1's contract note)", () => {
      useWorkComparisonStore.getState().setRange("someauthor", { start: 1999, end: 2099 });

      expect(useWorkComparisonStore.getState().getRange("someauthor")).toEqual({
        start: 1999,
        end: 2099,
      });
    });

    it("setRange(null) clears a previously stored window", () => {
      const store = useWorkComparisonStore.getState();
      store.setRange("someauthor", { start: 2020, end: 2022 });
      store.setRange("someauthor", null);

      expect(useWorkComparisonStore.getState().getRange("someauthor")).toBeNull();
    });

    it("clearSelection empties selectedWorkIds without touching range", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2]);
      store.setRange("someauthor", { start: 2020, end: 2022 });

      store.clearSelection("someauthor");

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([]);
      expect(useWorkComparisonStore.getState().getRange("someauthor")).toEqual({
        start: 2020,
        end: 2022,
      });
    });
  });

  describe("mutation actions delegate to comparisonSelection.ts's pure functions", () => {
    it("addWork appends in order and never double-adds an already-selected id", () => {
      const store = useWorkComparisonStore.getState();
      store.addWork("someauthor", 1);
      store.addWork("someauthor", 2);
      store.addWork("someauthor", 1);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([1, 2]);
    });

    it("addWork refuses an 11th work once the 10-work cap is reached (MAX_SELECTED_WORKS)", () => {
      const store = useWorkComparisonStore.getState();
      const tenWorks = Array.from({ length: MAX_SELECTED_WORKS }, (_, i) => i + 1);
      store.setSelection("someauthor", tenWorks);

      store.addWork("someauthor", 999);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual(tenWorks);
    });

    it("removeWork removes exactly the given id", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);

      store.removeWork("someauthor", 2);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([1, 3]);
    });

    it("selectAllInFandom adds additively, up to the cap, and surfaces a SelectAllInFandomResult", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const result = store.selectAllInFandom("someauthor", [100, 200, 300]);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 100,
      ]);
      expect(result).toEqual({
        selectedIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
        addedCount: 1,
        requestedCount: 3,
      });
    });

    it("deselectAllInFandom removes exactly the given fandom's ids", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);

      store.deselectAllInFandom("someauthor", [1, 2]);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([3]);
    });
  });

  describe("persistence", () => {
    it("persists byUsername to localStorage under a namespaced key", () => {
      useWorkComparisonStore.getState().setSelection("persisted_author", [42]);

      const raw = window.localStorage.getItem("ao3-stats-plus-work-comparison-store");
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw ?? "{}").state.byUsername.persisted_author.selectedWorkIds).toEqual([
        42,
      ]);
    });

    it("rehydrates in-memory state from localStorage (round trip after a simulated remount)", async () => {
      useWorkComparisonStore.getState().setSelection("persisted_author", [7, 8]);
      useWorkComparisonStore.getState().setRange("persisted_author", { start: 2019, end: 2021 });

      // A real remount creates a brand-new store instance that auto-
      // hydrates from whatever's on disk at that moment (persist runs
      // hydrate() once at store creation, per the installed middleware) -
      // vi.resetModules() + a fresh dynamic import is what actually
      // exercises that path. Reusing this file's already-imported
      // singleton and just calling setState({byUsername: {}}) first would
      // NOT be an equivalent simulation: zustand's persist middleware
      // wraps setState to also re-persist on every call, so that call
      // would silently clobber the very data on disk this test means to
      // read back.
      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getSelection("persisted_author")).toEqual([7, 8]);
      expect(freshStore.getState().getRange("persisted_author")).toEqual({
        start: 2019,
        end: 2021,
      });
    });

    it("falls back cleanly (no throw) when localStorage holds a corrupt/incompatible blob", async () => {
      window.localStorage.setItem("ao3-stats-plus-work-comparison-store", "{not valid json");

      // A throw/rejection here fails the test on its own - no need for an
      // explicit try/catch - this just documents that reaching the
      // assertion below IS the "didn't throw" proof.
      await useWorkComparisonStore.persist.rehydrate();

      expect(useWorkComparisonStore.getState().getSelection("anyone")).toEqual([]);
    });

    it("falls back cleanly (no throw) when localStorage has no entry at all for this store", async () => {
      window.localStorage.removeItem("ao3-stats-plus-work-comparison-store");

      await useWorkComparisonStore.persist.rehydrate();

      expect(useWorkComparisonStore.getState().getSelection("anyone")).toEqual([]);
    });
  });

  // docs/plans/additional-metric-trend-charts.md §3.0 ("Selected-metric
  // state"): the per-work metric toggle's selected tab persists per-username
  // in this same store, alongside selectedWorkIds/range - a fresh username
  // reads null (caller applies its own default, e.g. "hits") rather than
  // this store hardcoding a default metric key.
  describe("selectedMetric (per-work metric toggle persistence)", () => {
    it("getSelectedMetric returns null for a username never seen before", () => {
      expect(useWorkComparisonStore.getState().getSelectedMetric("someauthor")).toBeNull();
    });

    it("setSelectedMetric / getSelectedMetric round-trips a metric key", () => {
      useWorkComparisonStore.getState().setSelectedMetric("someauthor", "comments");

      expect(useWorkComparisonStore.getState().getSelectedMetric("someauthor")).toBe("comments");
    });

    it("keeps selectedMetric independent per username", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelectedMetric("authorA", "bookmarks");
      store.setSelectedMetric("authorB", "subscriptions");

      expect(useWorkComparisonStore.getState().getSelectedMetric("authorA")).toBe("bookmarks");
      expect(useWorkComparisonStore.getState().getSelectedMetric("authorB")).toBe("subscriptions");
    });

    it("setSelectedMetric never touches selectedWorkIds/range for the same username", () => {
      const store = useWorkComparisonStore.getState();
      store.setSelection("someauthor", [1, 2]);
      store.setRange("someauthor", { start: 2020, end: 2022 });

      store.setSelectedMetric("someauthor", "kudos");

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([1, 2]);
      expect(useWorkComparisonStore.getState().getRange("someauthor")).toEqual({
        start: 2020,
        end: 2022,
      });
    });

    it("persists selectedMetric to localStorage and rehydrates it on a simulated remount", async () => {
      useWorkComparisonStore.getState().setSelectedMetric("persisted_author", "comments");

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getSelectedMetric("persisted_author")).toBe("comments");
    });
  });

  // docs/plans/date-range-slider-month-granularity.md D2 ("Persisted year-
  // range from before this change") + §"useWorkComparisonStore.ts changes":
  // `range` moves from year semantics to month-index semantics, so a
  // pre-v1 persisted range (e.g. {start: 2018, end: 2026}, written before
  // this change shipped) would otherwise be silently MISREAD as a month-
  // index window (year ~168) rather than years. The persisted `version`
  // bumps from the implicit 0 to 1, with a `migrate` that NULLS any pre-v1
  // `range` on every byUsername entry - dropping it is safe (ephemeral view
  // state; the user simply lands on the new real-capture default) - while
  // leaving `selectedWorkIds`/`selectedMetric` untouched.
  describe("persist version bump + migration of pre-v1 year ranges (T5)", () => {
    const STORAGE_KEY = "ao3-stats-plus-work-comparison-store";

    function writeRawPersistedBlob(state: unknown, version?: number) {
      const blob: { state: unknown; version?: number } = { state };
      if (version !== undefined) blob.version = version;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    }

    it("nulls a pre-v1 persisted range (implicit version 0, no version key at all) on rehydrate", async () => {
      writeRawPersistedBlob({
        byUsername: {
          someauthor: {
            selectedWorkIds: [1, 2],
            range: { start: 2018, end: 2026 },
            selectedMetric: "kudos",
          },
        },
      });

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getRange("someauthor")).toBeNull();
    });

    it("preserves selectedWorkIds/selectedMetric for the same username while nulling its pre-v1 range", async () => {
      writeRawPersistedBlob({
        byUsername: {
          someauthor: {
            selectedWorkIds: [1, 2],
            range: { start: 2018, end: 2026 },
            selectedMetric: "kudos",
          },
        },
      });

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getSelection("someauthor")).toEqual([1, 2]);
      expect(freshStore.getState().getSelectedMetric("someauthor")).toBe("kudos");
    });

    it("nulls a pre-v1 range independently across every byUsername entry, not just the first", async () => {
      writeRawPersistedBlob({
        byUsername: {
          authorA: {
            selectedWorkIds: [1],
            range: { start: 2018, end: 2026 },
            selectedMetric: null,
          },
          authorB: {
            selectedWorkIds: [2],
            range: { start: 2010, end: 2020 },
            selectedMetric: null,
          },
        },
      });

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getRange("authorA")).toBeNull();
      expect(freshStore.getState().getRange("authorB")).toBeNull();
    });

    it("leaves a byUsername entry with an already-null range untouched (no throw)", async () => {
      writeRawPersistedBlob({
        byUsername: {
          someauthor: { selectedWorkIds: [1], range: null, selectedMetric: null },
        },
      });

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await expect(freshStore.persist.rehydrate()).resolves.not.toThrow();
      expect(freshStore.getState().getRange("someauthor")).toBeNull();
      expect(freshStore.getState().getSelection("someauthor")).toEqual([1]);
    });

    it("does NOT null a range already written at the current (v1) version - only pre-v1 data migrates", async () => {
      writeRawPersistedBlob(
        {
          byUsername: {
            someauthor: {
              selectedWorkIds: [1],
              range: { start: 24240, end: 24300 }, // a real v1 month-index window
              selectedMetric: null,
            },
          },
        },
        1,
      );

      vi.resetModules();
      const { useWorkComparisonStore: freshStore } = await import("./useWorkComparisonStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getRange("someauthor")).toEqual({ start: 24240, end: 24300 });
    });

    it("persists new writes at the current version (readable by a byte-for-byte re-import, not just this in-memory session)", async () => {
      useWorkComparisonStore.getState().setRange("someauthor", { start: 24240, end: 24300 });

      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw ?? "{}") as { version?: number };
      expect(parsed.version).toBe(1);
    });
  });
});
