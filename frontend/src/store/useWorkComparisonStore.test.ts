import { beforeEach, describe, expect, it } from "vitest";
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

      // Simulate a fresh mount reading whatever's on disk, independent of
      // this test's own in-memory mutations above.
      useWorkComparisonStore.setState({ byUsername: {} });
      await useWorkComparisonStore.persist.rehydrate();

      expect(useWorkComparisonStore.getState().getSelection("persisted_author")).toEqual([7, 8]);
      expect(useWorkComparisonStore.getState().getRange("persisted_author")).toEqual({
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
});
