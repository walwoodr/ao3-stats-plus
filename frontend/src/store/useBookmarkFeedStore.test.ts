import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBookmarkFeedStore } from "./useBookmarkFeedStore";
import { useWorkComparisonStore } from "./useWorkComparisonStore";
import { MAX_SELECTED_WORKS } from "../lib/comparisonSelection";

// useBookmarkFeedStore is a NEW, persisted per-username store
// (docs/plans/bookmark-notes-feed.md §T-05) holding ONLY selectedWorkIds -
// no range, no metric - under its own distinct localStorage key. It mirrors
// useWorkComparisonStore.ts's create()(persist(...)) + byUsername +
// EMPTY_SELECTION-identity conventions, and delegates every mutation to
// comparisonSelection.ts's existing pure functions, but it deliberately does
// NOT reconcile an empty selection back to the first work (Decision D1) -
// the whole point of this store existing separately from
// useWorkComparisonStore is that "empty" is a meaningful, stable state here
// ("no filter, show all"), not a degenerate one to repair. The module does
// not exist yet - every test below is expected to fail on import alone.
describe("useBookmarkFeedStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useBookmarkFeedStore.setState({ byUsername: {} });
    useWorkComparisonStore.setState({ byUsername: {} });
  });

  describe("reads: default state for a username never seen before", () => {
    it("getSelection returns an empty array", () => {
      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([]);
    });

    // Same referential-stability regression guard as
    // useWorkComparisonStore.test.ts's own version of this test - a naive
    // fallback object/array allocated fresh on every call breaks
    // useSyncExternalStore's snapshot-stability check.
    it("returns a referentially-stable empty selection array across repeated calls for the same unseen username", () => {
      const first = useBookmarkFeedStore.getState().getSelection("neverseen");
      const second = useBookmarkFeedStore.getState().getSelection("neverseen");

      expect(first).toBe(second);
    });
  });

  describe("per-username isolation", () => {
    it("keeps selection independent across usernames", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("authorA", [1, 2]);
      store.setSelection("authorB", [9]);

      expect(useBookmarkFeedStore.getState().getSelection("authorA")).toEqual([1, 2]);
      expect(useBookmarkFeedStore.getState().getSelection("authorB")).toEqual([9]);
    });

    it("addWork for one username never affects another username's selection", () => {
      useBookmarkFeedStore.getState().setSelection("authorA", [1]);

      useBookmarkFeedStore.getState().addWork("authorB", 5);

      expect(useBookmarkFeedStore.getState().getSelection("authorA")).toEqual([1]);
      expect(useBookmarkFeedStore.getState().getSelection("authorB")).toEqual([5]);
    });
  });

  describe("setSelection / clearSelection", () => {
    it("setSelection replaces the whole selected-ids array", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);
      store.setSelection("someauthor", [4]);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([4]);
    });

    // The core D1 behavior this store exists to encode: clearing down to
    // empty MUST stay empty - never silently repaired back to a "first
    // work" default the way useWorkComparisonStore's reconcileSelection
    // does. This is a deliberate departure (plan §"Decisions resolved" D1),
    // not an oversight.
    it("clearSelection empties selectedWorkIds and it stays empty (no first-work fallback, D1)", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2]);

      store.clearSelection("someauthor");

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([]);
    });

    it("setSelection([]) also stays empty (no first-work fallback, D1)", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2]);

      store.setSelection("someauthor", []);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([]);
    });
  });

  describe("mutation actions delegate to comparisonSelection.ts's pure functions", () => {
    it("addWork appends in order and never double-adds an already-selected id", () => {
      const store = useBookmarkFeedStore.getState();
      store.addWork("someauthor", 1);
      store.addWork("someauthor", 2);
      store.addWork("someauthor", 1);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([1, 2]);
    });

    it("addWork refuses an 11th work once the 10-work cap is reached (MAX_SELECTED_WORKS, C2 - cap applies only to an active filter)", () => {
      const store = useBookmarkFeedStore.getState();
      const tenWorks = Array.from({ length: MAX_SELECTED_WORKS }, (_, i) => i + 1);
      store.setSelection("someauthor", tenWorks);

      store.addWork("someauthor", 999);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual(tenWorks);
    });

    it("removeWork removes exactly the given id", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);

      store.removeWork("someauthor", 2);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([1, 3]);
    });

    // Removing every selected work one at a time must land back at [], not
    // be intercepted/repaired - reinforces the D1 behavior from a different
    // interaction path than clearSelection/setSelection([]) above.
    it("removeWork down to zero selected works stays empty (no first-work fallback, D1)", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1]);

      store.removeWork("someauthor", 1);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([]);
    });

    it("selectAllInFandom adds additively, up to the cap, and surfaces a SelectAllInFandomResult", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const result = store.selectAllInFandom("someauthor", [100, 200, 300]);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 100,
      ]);
      expect(result).toEqual({
        selectedIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
        addedCount: 1,
        requestedCount: 3,
      });
    });

    it("deselectAllInFandom removes exactly the given fandom's ids", () => {
      const store = useBookmarkFeedStore.getState();
      store.setSelection("someauthor", [1, 2, 3]);

      store.deselectAllInFandom("someauthor", [1, 2]);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([3]);
    });
  });

  describe("independence from useWorkComparisonStore", () => {
    it("mutating useBookmarkFeedStore never touches useWorkComparisonStore's selection for the same username", () => {
      useWorkComparisonStore.getState().setSelection("someauthor", [1, 2]);

      useBookmarkFeedStore.getState().setSelection("someauthor", [9]);

      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([1, 2]);
      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([9]);
    });

    it("mutating useWorkComparisonStore never touches useBookmarkFeedStore's selection for the same username", () => {
      useBookmarkFeedStore.getState().setSelection("someauthor", [9]);

      useWorkComparisonStore.getState().setSelection("someauthor", [1, 2]);

      expect(useBookmarkFeedStore.getState().getSelection("someauthor")).toEqual([9]);
      expect(useWorkComparisonStore.getState().getSelection("someauthor")).toEqual([1, 2]);
    });
  });

  describe("persistence", () => {
    it("persists byUsername to localStorage under its OWN, distinct namespaced key", () => {
      useBookmarkFeedStore.getState().setSelection("persisted_author", [42]);

      const raw = window.localStorage.getItem("ao3-stats-plus-bookmark-feed-store");
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw ?? "{}").state.byUsername.persisted_author.selectedWorkIds).toEqual([
        42,
      ]);
    });

    it("does not share a localStorage key with useWorkComparisonStore", () => {
      useBookmarkFeedStore.getState().setSelection("persisted_author", [42]);
      useWorkComparisonStore.getState().setSelection("persisted_author", [7]);

      const feedRaw = window.localStorage.getItem("ao3-stats-plus-bookmark-feed-store");
      const comparisonRaw = window.localStorage.getItem("ao3-stats-plus-work-comparison-store");
      expect(JSON.parse(feedRaw ?? "{}").state.byUsername.persisted_author.selectedWorkIds).toEqual(
        [42],
      );
      expect(
        JSON.parse(comparisonRaw ?? "{}").state.byUsername.persisted_author.selectedWorkIds,
      ).toEqual([7]);
    });

    it("rehydrates in-memory state from localStorage (round trip after a simulated remount)", async () => {
      useBookmarkFeedStore.getState().setSelection("persisted_author", [7, 8]);

      vi.resetModules();
      const { useBookmarkFeedStore: freshStore } = await import("./useBookmarkFeedStore");
      await freshStore.persist.rehydrate();

      expect(freshStore.getState().getSelection("persisted_author")).toEqual([7, 8]);
    });

    it("falls back cleanly (no throw) when localStorage holds a corrupt/incompatible blob", async () => {
      window.localStorage.setItem("ao3-stats-plus-bookmark-feed-store", "{not valid json");

      await useBookmarkFeedStore.persist.rehydrate();

      expect(useBookmarkFeedStore.getState().getSelection("anyone")).toEqual([]);
    });

    it("falls back cleanly (no throw) when localStorage has no entry at all for this store", async () => {
      window.localStorage.removeItem("ao3-stats-plus-bookmark-feed-store");

      await useBookmarkFeedStore.persist.rehydrate();

      expect(useBookmarkFeedStore.getState().getSelection("anyone")).toEqual([]);
    });
  });
});
