import { create } from "zustand";
import { createJSONStorage, persist, type StorageValue } from "zustand/middleware";
import {
  addWork as pureAddWork,
  deselectAllInFandom as pureDeselectAllInFandom,
  removeWork as pureRemoveWork,
  selectAllInFandom as pureSelectAllInFandom,
  type MonthWindow,
  type SelectAllInFandomResult,
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
  range: MonthWindow | null;
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
  getRange: (username: string) => MonthWindow | null;
  getSelectedMetric: (username: string) => string | null;

  setSelection: (username: string, selectedWorkIds: number[]) => void;
  addWork: (username: string, workId: number) => void;
  removeWork: (username: string, workId: number) => void;
  selectAllInFandom: (username: string, fandomWorkIds: number[]) => SelectAllInFandomResult;
  deselectAllInFandom: (username: string, fandomWorkIds: number[]) => void;
  setRange: (username: string, range: MonthWindow | null) => void;
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

// Normalizes a missing `version` field to 0 on read. zustand 5.x's persist
// `migrate` hook only runs when the persisted blob has an explicit NUMERIC
// `version` field (verified against the installed
// node_modules/zustand/esm/middleware.mjs) - a blob written before this
// store ever set a `version` option at all has no version key, so without
// this wrapper `migrate` would silently never fire for it. Normalizing the
// missing key to 0 here makes every pre-v1 blob (explicit 0 OR absent)
// reliably trigger `migrate` below.
const rawStorage = createJSONStorage<WorkComparisonState>(() => window.localStorage);
const migratingStorage = {
  getItem: async (name: string): Promise<StorageValue<WorkComparisonState> | null> => {
    const value = await rawStorage?.getItem(name);
    if (value && typeof value === "object" && !("version" in value)) {
      return { ...value, version: 0 };
    }
    return value ?? null;
  },
  setItem: (name: string, value: StorageValue<WorkComparisonState>) => rawStorage?.setItem(name, value),
  removeItem: (name: string) => rawStorage?.removeItem(name),
};

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
    {
      name: "ao3-stats-plus-work-comparison-store",
      storage: migratingStorage,
      // Persist migration (docs/plans/date-range-slider-month-granularity.md
      // D2, "Persisted year-range from before this change"): `range` moved
      // from year semantics to month-index semantics, so a pre-v1 persisted
      // range would otherwise be silently misread as a month-index window
      // (a year number like 2018 would decode to a date around year 168).
      // version bumps from the implicit 0 -> 1; any entry persisted before
      // this change migrates by nulling its `range` only - ephemeral view
      // state, safe to drop - leaving selectedWorkIds/selectedMetric intact.
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as { byUsername?: Record<string, WorkComparisonSelection> };
        const byUsername = state?.byUsername ?? {};
        const migratedByUsername = Object.fromEntries(
          Object.entries(byUsername).map(([username, entry]) => [
            username,
            { ...entry, range: null },
          ]),
        );
        // zustand's `merge` step (its default shallow-merge behavior, not
        // overridden here) layers this result over the freshly-created
        // store's action functions, so only the persisted DATA shape needs
        // to be returned here - the `WorkComparisonState` cast reflects
        // that merge contract rather than claiming this object itself
        // carries every store method.
        return { ...state, byUsername: migratedByUsername } as WorkComparisonState;
      },
    },
  ),
);
