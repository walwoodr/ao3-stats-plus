import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addWork as pureAddWork,
  deselectAllInFandom as pureDeselectAllInFandom,
  removeWork as pureRemoveWork,
  selectAllInFandom as pureSelectAllInFandom,
  type SelectAllInFandomResult,
} from "../lib/comparisonSelection";

// Persisted per-username selection store for the bookmark notes feed
// (docs/plans/bookmark-notes-feed.md T-05). Mirrors useWorkComparisonStore's
// create()(persist(...)) + byUsername + EMPTY_SELECTION-identity
// conventions, but holds ONLY selectedWorkIds (no range, no metric) under
// its own distinct localStorage key, and every mutation delegates to
// comparisonSelection.ts's pure functions exactly as the comparison store
// does. Critically, it deliberately does NOT reconcile an empty selection
// back to a first-work default (Decision D1): empty selectedWorkIds is a
// meaningful, stable state here ("no filter, show all"), not a degenerate
// one to repair - the whole reason this store exists separately from
// useWorkComparisonStore.
export interface BookmarkFeedSelection {
  selectedWorkIds: number[];
}

interface BookmarkFeedState {
  byUsername: Record<string, BookmarkFeedSelection>;

  getSelection: (username: string) => number[];

  setSelection: (username: string, selectedWorkIds: number[]) => void;
  addWork: (username: string, workId: number) => void;
  removeWork: (username: string, workId: number) => void;
  selectAllInFandom: (username: string, fandomWorkIds: number[]) => SelectAllInFandomResult;
  deselectAllInFandom: (username: string, fandomWorkIds: number[]) => void;
  clearSelection: (username: string) => void;
}

// Referenced by identity rather than recreated inline: a naive `byUsername[
// username] ?? { selectedWorkIds: [] }` fallback allocates a NEW object
// every call, which breaks useSyncExternalStore's snapshot-stability check
// once a component selects through it (infinite render loop).
const EMPTY_SELECTION: BookmarkFeedSelection = { selectedWorkIds: [] };

function getEntry(byUsername: Record<string, BookmarkFeedSelection>, username: string) {
  return byUsername[username] ?? EMPTY_SELECTION;
}

export const useBookmarkFeedStore = create<BookmarkFeedState>()(
  persist(
    (set, get) => ({
      byUsername: {},

      getSelection: (username) => getEntry(get().byUsername, username).selectedWorkIds,

      setSelection: (username, selectedWorkIds) =>
        set((state) => ({
          byUsername: { ...state.byUsername, [username]: { selectedWorkIds } },
        })),

      addWork: (username, workId) =>
        set((state) => {
          const entry = getEntry(state.byUsername, username);
          return {
            byUsername: {
              ...state.byUsername,
              [username]: { selectedWorkIds: pureAddWork(entry.selectedWorkIds, workId) },
            },
          };
        }),

      removeWork: (username, workId) =>
        set((state) => {
          const entry = getEntry(state.byUsername, username);
          return {
            byUsername: {
              ...state.byUsername,
              [username]: { selectedWorkIds: pureRemoveWork(entry.selectedWorkIds, workId) },
            },
          };
        }),

      selectAllInFandom: (username, fandomWorkIds) => {
        const entry = getEntry(get().byUsername, username);
        const result = pureSelectAllInFandom(entry.selectedWorkIds, fandomWorkIds);
        set((state) => ({
          byUsername: { ...state.byUsername, [username]: { selectedWorkIds: result.selectedIds } },
        }));
        return result;
      },

      deselectAllInFandom: (username, fandomWorkIds) =>
        set((state) => {
          const entry = getEntry(state.byUsername, username);
          return {
            byUsername: {
              ...state.byUsername,
              [username]: {
                selectedWorkIds: pureDeselectAllInFandom(entry.selectedWorkIds, fandomWorkIds),
              },
            },
          };
        }),

      // D1: explicitly does NOT fall back to a first-work default - clearing
      // to empty stays empty, interpreted downstream as "no filter, show
      // all works."
      clearSelection: (username) =>
        set((state) => ({
          byUsername: { ...state.byUsername, [username]: { selectedWorkIds: [] } },
        })),
    }),
    { name: "ao3-stats-plus-bookmark-feed-store" },
  ),
);
