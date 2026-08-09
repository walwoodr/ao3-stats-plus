import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addWork as pureAddWork,
  deselectAllInFandom as pureDeselectAllInFandom,
  removeWork as pureRemoveWork,
  selectAllInFandom as pureSelectAllInFandom,
  type SelectAllInFandomResult,
  type YearWindow,
} from "../lib/comparisonSelection";

// Persisted per-username selection/range store (plan §2.1) - moves
// `selectedWorkIds`/`range` out of WorkComparisonSection's local useState so
// the deferred bookmarks/comments/subscriptions work can build against this
// stable interface instead of the picker's internals. Follows
// useTokenStore.ts's exact convention: create()(persist(...)), a
// byUsername map, localStorage. Every mutation delegates to
// comparisonSelection.ts's pure functions - no selection logic is
// duplicated here.
export interface WorkComparisonSelection {
  selectedWorkIds: number[];
  range: YearWindow | null;
  // Per-work metric toggle persistence (docs/plans/additional-metric-trend-
  // charts.md §3.0) - the selected key from WorkComparisonSection's
  // top-level [Hits|Kudos|Comments|Bookmarks|Subscriptions] tablist. `null`
  // for a username never seen before; the caller (not this store) applies
  // its own default ("hits") rather than this store hardcoding one.
  selectedMetric: string | null;
}

interface WorkComparisonState {
  byUsername: Record<string, WorkComparisonSelection>;

  getSelection: (username: string) => number[];
  getRange: (username: string) => YearWindow | null;
  getSelectedMetric: (username: string) => string | null;

  setSelection: (username: string, selectedWorkIds: number[]) => void;
  addWork: (username: string, workId: number) => void;
  removeWork: (username: string, workId: number) => void;
  selectAllInFandom: (username: string, fandomWorkIds: number[]) => SelectAllInFandomResult;
  deselectAllInFandom: (username: string, fandomWorkIds: number[]) => void;
  setRange: (username: string, range: YearWindow | null) => void;
  setSelectedMetric: (username: string, metric: string) => void;
  clearSelection: (username: string) => void;
}

// Module-level constant, referenced by identity rather than recreated
// inline: a naive `byUsername[username] ?? { selectedWorkIds: [], range:
// null }` fallback allocates a NEW object every call, which breaks
// useSyncExternalStore's snapshot-stability check once a component selects
// through it (infinite render loop). All three fields share this one
// instance.
const EMPTY_SELECTION: WorkComparisonSelection = {
  selectedWorkIds: [],
  range: null,
  selectedMetric: null,
};

function getEntry(byUsername: Record<string, WorkComparisonSelection>, username: string) {
  return byUsername[username] ?? EMPTY_SELECTION;
}

export const useWorkComparisonStore = create<WorkComparisonState>()(
  persist(
    (set, get) => ({
      byUsername: {},

      getSelection: (username) => getEntry(get().byUsername, username).selectedWorkIds,
      getRange: (username) => getEntry(get().byUsername, username).range,
      getSelectedMetric: (username) => getEntry(get().byUsername, username).selectedMetric,

      setSelection: (username, selectedWorkIds) =>
        set((state) => ({
          byUsername: {
            ...state.byUsername,
            [username]: { ...getEntry(state.byUsername, username), selectedWorkIds },
          },
        })),

      addWork: (username, workId) =>
        set((state) => {
          const entry = getEntry(state.byUsername, username);
          return {
            byUsername: {
              ...state.byUsername,
              [username]: { ...entry, selectedWorkIds: pureAddWork(entry.selectedWorkIds, workId) },
            },
          };
        }),

      removeWork: (username, workId) =>
        set((state) => {
          const entry = getEntry(state.byUsername, username);
          return {
            byUsername: {
              ...state.byUsername,
              [username]: {
                ...entry,
                selectedWorkIds: pureRemoveWork(entry.selectedWorkIds, workId),
              },
            },
          };
        }),

      selectAllInFandom: (username, fandomWorkIds) => {
        const entry = getEntry(get().byUsername, username);
        const result = pureSelectAllInFandom(entry.selectedWorkIds, fandomWorkIds);
        set((state) => ({
          byUsername: {
            ...state.byUsername,
            [username]: { ...entry, selectedWorkIds: result.selectedIds },
          },
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
                ...entry,
                selectedWorkIds: pureDeselectAllInFandom(entry.selectedWorkIds, fandomWorkIds),
              },
            },
          };
        }),

      setRange: (username, range) =>
        set((state) => ({
          byUsername: {
            ...state.byUsername,
            [username]: { ...getEntry(state.byUsername, username), range },
          },
        })),

      setSelectedMetric: (username, metric) =>
        set((state) => ({
          byUsername: {
            ...state.byUsername,
            [username]: { ...getEntry(state.byUsername, username), selectedMetric: metric },
          },
        })),

      clearSelection: (username) =>
        set((state) => ({
          byUsername: {
            ...state.byUsername,
            [username]: { ...getEntry(state.byUsername, username), selectedWorkIds: [] },
          },
        })),
    }),
    { name: "ao3-stats-plus-work-comparison-store" },
  ),
);
