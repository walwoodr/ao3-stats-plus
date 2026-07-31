import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ClientError } from "graphql-request";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useStatsForUser, type PerWorkSeries } from "../queries/useStatsForUser";
import { TokenEntryForm } from "../components/TokenEntryForm";
import { TrendChart } from "../components/charts/TrendChart";
import { RatioChart } from "../components/charts/RatioChart";

// graphql-request throws a ClientError (with a `.response` carrying the
// GraphQL `errors` array) for a real, backend-confirmed rejection - e.g. an
// invalid/expired token the server actually evaluated and rejected. A plain
// fetch/network failure (a generic TypeError with no `.response` - what a
// CORS rejection or connectivity problem surfaces as) means the request
// never got a real answer from the server at all, so it says nothing about
// whether the token itself is valid. Conflating the two previously showed
// "your token is wrong" for CORS/network failures, sending users chasing
// the wrong problem (see README.md's FRONTEND_ORIGINS/CORS note).
const TOKEN_MISMATCH_MESSAGE =
  "That token doesn't match this username - it may be invalid, expired, or not authorized.";
const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server - this may be a network or configuration issue, not necessarily " +
  "your token.";

function messageForStatsError(error: Error): string {
  return error instanceof ClientError ? TOKEN_MISMATCH_MESSAGE : NETWORK_ERROR_MESSAGE;
}

// Composes the token handoff (useTokenFromUrl) with the stats read
// (useStatsForUser) into the dashboard's state machine: no token -> manual
// entry, loading -> announced skeleton, error (token mismatch/unknown user)
// -> explanation + retry form, otherwise the aggregate trend/ratio charts
// (plus a per-work section once there's per-work history).
export function DashboardPage() {
  const { username = "" } = useParams<{ username: string }>();
  const token = useTokenFromUrl(username);
  const setToken = useTokenStore((state) => state.setToken);
  const clearToken = useTokenStore((state) => state.clearToken);
  const { data, error, isLoading } = useStatsForUser(username, token);

  // Once a stored token turns out to be wrong/expired it's cleared from the
  // store (in the effect below), so a reload without a ?token= param falls
  // back to the manual-entry state instead of immediately refiring the same
  // doomed query. mismatchMessage/lastSeenError are adjusted during render
  // (React's documented pattern for state derived from a prop/value change,
  // https://react.dev/learn/you-might-not-need-an-effect) rather than via
  // setState inside the effect, so clearing the token doesn't also erase
  // the error state's own precondition before it can be shown.
  const [mismatchMessage, setMismatchMessage] = useState<string | null>(null);
  const [lastSeenError, setLastSeenError] = useState<Error | null>(null);
  // A token that arrived via the URL/stored state re-shows the entry form
  // on error so the user can correct it. A token they *just* typed and
  // submitted this session already got its one shot - re-showing the same
  // form would just loop, so that case gets a plainer error instead (they
  // can reload to start over, same as the stored-token path does).
  const [submittedManually, setSubmittedManually] = useState(false);

  if (error && error !== lastSeenError) {
    setLastSeenError(error);
    setMismatchMessage(messageForStatsError(error));
  }

  // Only a backend-confirmed rejection means the token itself is actually
  // wrong - a plain network/CORS failure (see messageForStatsError above)
  // says nothing about the token, so clearing it there would silently log
  // a user out over a transient connectivity blip.
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
        <h1 className="font-display text-2xl font-semibold text-ink">{username}&rsquo;s stats</h1>
        <p className="mt-2 text-destructive">{mismatchMessage}</p>
        {submittedManually ? (
          <p className="mt-4 text-sm text-ink-soft">Reload the page to try a different token.</p>
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
        Loading your stats...
      </div>
    );
  }

  const aggregateSeries = data?.statsForUser.aggregateSeries ?? [];
  const perWorkSeries = data?.statsForUser.perWorkSeries ?? [];
  const earliestPostYear = data?.statsForUser.earliestPostYear ?? null;

  // The synthetic "before you had any stats, you were at zero" baseline
  // point, built only when earliestPostYear is present AND actually sorts
  // before the first real snapshot - a future/same-year value (e.g. from a
  // borderline first-ingest race) would otherwise draw a nonsensical
  // backwards or overlapping lead-in segment.
  const firstCapturedOn = aggregateSeries[0]?.capturedOn;
  const leadInDate = earliestPostYear !== null ? `${earliestPostYear}-01-01` : null;
  const hasLeadIn = leadInDate !== null && !!firstCapturedOn && leadInDate < firstCapturedOn;
  const hitsLeadIn = hasLeadIn ? { capturedOn: leadInDate as string, value: 0 } : undefined;
  const kudosLeadIn = hasLeadIn ? { capturedOn: leadInDate as string, value: 0 } : undefined;
  const ratioLeadIn = hasLeadIn ? { capturedOn: leadInDate as string, ratio: 0 } : undefined;

  const notEnoughHistory = !hasLeadIn && aggregateSeries.length === 1;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="font-display text-2xl font-semibold text-ink">{username}&rsquo;s stats</h1>

      {aggregateSeries.length === 0 && (
        <p className="mt-2 text-ink-soft">No snapshots yet - run the bookmarklet to capture one.</p>
      )}
      {notEnoughHistory && (
        <p className="mt-2 text-ink-soft">
          You only have one snapshot so far - not enough history yet to show a real trend. Check
          back after your next capture.
        </p>
      )}

      {aggregateSeries.length > 0 && (
        <div className="mt-6 flex flex-col gap-8">
          <TrendChart
            title="Total hits"
            description="Total hits across all your works, combined, at each snapshot you've captured."
            valueLabel="Hits"
            points={aggregateSeries.map((point) => ({
              capturedOn: point.capturedOn,
              value: point.totalHits,
            }))}
            leadIn={hitsLeadIn}
          />
          <TrendChart
            title="Total kudos"
            description="Total kudos across all your works, combined, at each snapshot you've captured."
            valueLabel="Kudos"
            points={aggregateSeries.map((point) => ({
              capturedOn: point.capturedOn,
              value: point.totalKudos,
            }))}
            leadIn={kudosLeadIn}
          />
          <RatioChart
            title="Kudos-to-hits ratio"
            description="What share of your hits turn into kudos, over time - a rough measure of reader engagement rather than raw traffic."
            points={aggregateSeries.map((point) => ({
              capturedOn: point.capturedOn,
              ratio: point.kudosToHitsRatio,
            }))}
            leadIn={ratioLeadIn}
          />
        </div>
      )}

      {perWorkSeries.length > 0 && <PerWorkTrends perWorkSeries={perWorkSeries} />}
    </div>
  );
}

function PerWorkTrends({ perWorkSeries }: { perWorkSeries: PerWorkSeries[] }) {
  const [selectedWorkId, setSelectedWorkId] = useState(perWorkSeries[0]?.ao3WorkId);
  const selectedWork =
    perWorkSeries.find((work) => work.ao3WorkId === selectedWorkId) ?? perWorkSeries[0];

  return (
    <div className="mt-10 flex flex-col gap-6">
      <h2 className="font-display text-xl font-semibold text-ink">Per-work trends</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="per-work-select" className="text-sm font-medium text-ink">
          Work
        </label>
        <select
          id="per-work-select"
          value={selectedWork?.ao3WorkId}
          onChange={(event) => setSelectedWorkId(Number(event.target.value))}
          className="w-fit rounded-md border border-ink/20 bg-card px-3 py-2 text-sm text-ink outline-none transition-colors duration-200 focus:border-accent focus:ring-[3px] focus:ring-accent/15"
        >
          {perWorkSeries.map((work) => (
            // label (not child text) sets the option's display/accessible
            // name here so the work's title has exactly one visible,
            // unhidden occurrence on the page - the heading below - rather
            // than colliding with this collapsed (and therefore
            // not-visible) <option>.
            <option key={work.ao3WorkId} value={work.ao3WorkId} label={work.title} />
          ))}
        </select>
      </div>

      {selectedWork && (
        <div className="flex flex-col gap-8">
          <h3 className="font-display text-lg font-medium text-ink">{selectedWork.title}</h3>
          <TrendChart
            title={`${selectedWork.title} hits`}
            valueLabel="Hits"
            points={selectedWork.points.map((point) => ({
              capturedOn: point.capturedOn,
              value: point.hits,
            }))}
          />
          <TrendChart
            title={`${selectedWork.title} kudos`}
            valueLabel="Kudos"
            points={selectedWork.points.map((point) => ({
              capturedOn: point.capturedOn,
              value: point.kudos,
            }))}
          />
        </div>
      )}
    </div>
  );
}
