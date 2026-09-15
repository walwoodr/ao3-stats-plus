import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ClientError } from "graphql-request";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useBookmarkFeedStore } from "../store/useBookmarkFeedStore";
import { useStatsForUser, type PerWorkSeries } from "../queries/useStatsForUser";
import { reconcileSelectedWorkIds } from "../lib/bookmarkFeed";
import { TokenEntryForm } from "../components/TokenEntryForm";
import { WorkPicker } from "../components/WorkPicker";
import { BookmarkFeed } from "../components/BookmarkFeed";

// Mirrors DashboardPage's exact token/loading/error state machine (docs/
// plans/bookmark-notes-feed.md §3, T-08) - not extracted into a shared
// wrapper/hook here (logged to TECH_DEBT as a watch-item, per the plan's
// "States" section) to avoid a mid-feature refactor. The one real
// difference from DashboardPage: the picker is wired to the NEW,
// independent useBookmarkFeedStore rather than useWorkComparisonStore, and
// an empty selection is treated as "no filter, show all" (Decision D1) -
// never reconciled to a first-work fallback.
const TOKEN_MISMATCH_MESSAGE =
  "That token doesn't match this username - it may be invalid, expired, or not authorized.";
const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server - this may be a network or configuration issue, not necessarily " +
  "your token.";

function messageForStatsError(error: Error): string {
  return error instanceof ClientError ? TOKEN_MISMATCH_MESSAGE : NETWORK_ERROR_MESSAGE;
}

// Referenced by identity (not a fresh `[]` literal inline) so `perWorkSeries`
// stays referentially stable across renders while `data` is still loading -
// otherwise the useMemo below would recompute on every render regardless of
// whether the underlying selection actually changed.
const EMPTY_PER_WORK_SERIES: PerWorkSeries[] = [];

export function BookmarkFeedPage() {
  const { username = "" } = useParams<{ username: string }>();
  const token = useTokenFromUrl(username);
  const setToken = useTokenStore((state) => state.setToken);
  const clearToken = useTokenStore((state) => state.clearToken);
  const { data, error, isLoading } = useStatsForUser(username, token);

  const setSelectionInStore = useBookmarkFeedStore((state) => state.setSelection);
  const selectedWorkIds = useBookmarkFeedStore((state) => state.getSelection(username));
  // Computed above any early return (rules-of-hooks: `data` is already
  // available - possibly undefined pre-load - regardless of loading/error
  // state) so the "no filter" hint's gate (below) can use the SAME
  // effectively-no-filter signal as BookmarkFeed itself: a fully-stale
  // persisted selection (C9/D1, Review-flagged 2026-09-14) reconciles to []
  // identically to a genuinely empty one, while a partial-stale selection
  // still correctly reconciles to a real, non-empty filter.
  const perWorkSeries = data?.statsForUser.perWorkSeries ?? EMPTY_PER_WORK_SERIES;
  const reconciledSelectedWorkIds = useMemo(
    () => reconcileSelectedWorkIds(perWorkSeries, selectedWorkIds),
    [perWorkSeries, selectedWorkIds],
  );

  // Same "adjust during render" pattern DashboardPage uses for its own
  // mismatch message, so clearing the token doesn't also erase the error
  // state's precondition before it can be shown.
  const [mismatchMessage, setMismatchMessage] = useState<string | null>(null);
  const [lastSeenError, setLastSeenError] = useState<Error | null>(null);
  const [submittedManually, setSubmittedManually] = useState(false);

  if (error && error !== lastSeenError) {
    setLastSeenError(error);
    setMismatchMessage(messageForStatsError(error));
  }

  useEffect(() => {
    if (error instanceof ClientError) clearToken(username);
  }, [error, username, clearToken]);

  const handleManualToken = (enteredToken: string) => {
    setMismatchMessage(null);
    setSubmittedManually(true);
    setToken(username, enteredToken);
  };

  if (mismatchMessage) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {username}&rsquo;s bookmark notes
        </h1>
        {submittedManually ? (
          <>
            <p className="mt-2 text-destructive">{mismatchMessage}</p>
            <p className="mt-4 text-sm text-ink-soft">Reload the page to try a different token.</p>
          </>
        ) : (
          <div className="mt-6">
            <TokenEntryForm onSubmit={handleManualToken} error={mismatchMessage} />
          </div>
        )}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Connect your AO3 stats</h1>
        <p className="mt-2 text-ink-soft">
          We couldn&rsquo;t find a saved token for this browser. Paste the one from your
          bookmarklet&rsquo;s success message below to see your stats.
        </p>
        <div className="mt-6">
          <TokenEntryForm onSubmit={handleManualToken} />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" className="p-8 text-ink-soft">
        Loading your bookmark notes...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        {username}&rsquo;s bookmark notes
      </h1>

      {perWorkSeries.length === 0 ? (
        <p className="mt-2 text-ink-soft">No per-work history yet - run the bookmarklet first.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border border-ink/12 bg-card p-6">
            <WorkPicker
              perWorkSeries={perWorkSeries}
              selectedWorkIds={selectedWorkIds}
              onChange={(nextSelectedWorkIds) => setSelectionInStore(username, nextSelectedWorkIds)}
            />
            {reconciledSelectedWorkIds.length === 0 && (
              <p className="text-sm text-ink-soft">
                No filter — showing bookmarks from all works.
              </p>
            )}
          </div>

          <BookmarkFeed perWorkSeries={perWorkSeries} selectedWorkIds={selectedWorkIds} />

          <p className="text-xs text-ink-soft">
            Only public bookmarks are shown (authors can&rsquo;t see private bookmarks). This
            reflects your most recent capture and may be partial for heavily-bookmarked works.
          </p>
        </div>
      )}
    </div>
  );
}
