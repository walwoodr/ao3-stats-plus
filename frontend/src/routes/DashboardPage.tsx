import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ClientError } from "graphql-request";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useStatsForUser } from "../queries/useStatsForUser";
import { TokenEntryForm } from "../components/TokenEntryForm";
import { TrendChart } from "../components/charts/TrendChart";
import { MetricToggle } from "../components/charts/MetricToggle";
import { WorkComparisonSection } from "../components/WorkComparisonSection";

// Account-level metric toggle (docs/plans/additional-metric-trend-charts.md
// §3.0, T-I3): [Hits | Kudos | Subscribers] over one TrendChart. Ephemeral,
// plain useState (not persisted) - distinct from WorkComparisonSection's
// per-work metric, which IS persisted per-username (plan §3.0's "Selected-
// metric state").
const AGGREGATE_METRIC_TABS = [
  { key: "hits", label: "Hits" },
  { key: "kudos", label: "Kudos" },
  { key: "subscribers", label: "Subscribers" },
];

// graphql-request throws a ClientError (with a `.response` carrying the
// GraphQL `errors` array) both for a real, backend-confirmed rejection (an
// invalid/expired token the server actually evaluated and rejected) AND for
// any other non-2xx HTTP response (e.g. a transient backend 5xx) - see
// graphql-request's runRequest.ts: it wraps every `!fetchResponse.ok`
// response in a ClientError regardless of whether the body is a real,
// well-formed GraphQL error. `instanceof ClientError` alone can't tell these
// apart. A plain fetch/network failure (a generic TypeError with no
// `.response` - what a CORS rejection or connectivity problem surfaces as)
// is a third, distinct case that never reached the server at all.
//
// This backend (query_type.rb's `stats_for_user`) only ever raises a typed
// `GraphQL::ExecutionError` for a bad token/unknown username, which
// graphql_controller.rb renders via a bare `render json: result` - no
// explicit status, i.e. HTTP 200. Any other failure (an unhandled
// exception) takes graphql_controller.rb's rescue path or Rails' own default
// error response, both non-200. So "ClientError whose response arrived on a
// 2xx status" is the actual, accurate signal for "the backend evaluated the
// token and rejected it" - a non-2xx ClientError is a real server/transport
// failure that says nothing about the token, same as the network-error case.
// Maintenance fix (TECH_DEBT.md, 2026-07-31 entry): previously any
// `instanceof ClientError` cleared the token and showed "doesn't match",
// which would incorrectly blame a valid token for a transient 500.
const TOKEN_MISMATCH_MESSAGE =
  "That token doesn't match this username - it may be invalid, expired, or not authorized.";
const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server - this may be a network or configuration issue, not necessarily " +
  "your token.";

function isBackendConfirmedRejection(error: Error): boolean {
  if (!(error instanceof ClientError)) return false;
  const { status } = error.response;
  return status >= 200 && status < 300;
}

function messageForStatsError(error: Error): string {
  return isBackendConfirmedRejection(error) ? TOKEN_MISMATCH_MESSAGE : NETWORK_ERROR_MESSAGE;
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
  const [selectedMetric, setSelectedMetric] = useState("hits");

  if (error && error !== lastSeenError) {
    setLastSeenError(error);
    setMismatchMessage(messageForStatsError(error));
  }

  // Only a backend-confirmed rejection means the token itself is actually
  // wrong - a plain network/CORS failure, OR a ClientError that merely
  // wraps a non-2xx transport/server failure (see isBackendConfirmedRejection
  // above), says nothing about the token, so clearing it there would
  // silently log a user out over a transient connectivity blip or backend
  // 5xx.
  useEffect(() => {
    if (error && isBackendConfirmedRejection(error)) clearToken(username);
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
        {submittedManually ? (
          <>
            <p className="mt-2 text-destructive">{mismatchMessage}</p>
            <p className="mt-4 text-sm text-ink-soft">Reload the page to try a different token.</p>
          </>
        ) : (
          // TokenEntryForm renders mismatchMessage itself (as a role="alert"
          // echo of its error prop) - no separate <p> here, so the message
          // isn't announced/queryable twice for the same error.
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

  // Per docs/plans/date-range-slider-month-granularity.md §10 (D5, LOCKED):
  // the account-level charts no longer construct/pass a synthetic "before
  // you had any stats, you were at zero" leadIn point by default - that
  // capability (TrendChart's `leadIn` prop, leadInEpoch placement, the
  // `.chart-leadin-dot` tokens) remains fully intact for a future (deferred)
  // account-level widen control and for the per-work charts, which still
  // build and pass their own leadIn via WorkComparisonSection.
  //
  // D5: with the lead-in no longer drawn by default, a single real snapshot
  // is a lone dot, not a trend - "not enough history" is unconditional on
  // the snapshot count (previously also required `!hasLeadIn`, since a
  // lead-in used to turn even one snapshot into a minimal two-point line).
  const notEnoughHistory = aggregateSeries.length === 1;

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
          <h2 className="sr-only">Aggregate stats</h2>
          <MetricToggle
            label="Metric"
            tabs={AGGREGATE_METRIC_TABS}
            selectedKey={selectedMetric}
            onChange={setSelectedMetric}
          >
            {selectedMetric === "hits" && (
              <TrendChart
                title="Total hits"
                description="Total hits across all your works, combined, at each snapshot you've captured."
                valueLabel="Hits"
                points={aggregateSeries.map((point) => ({
                  capturedOn: point.capturedOn,
                  value: point.totalHits,
                }))}
              />
            )}
            {selectedMetric === "kudos" && (
              <TrendChart
                title="Total kudos"
                description="Total kudos across all your works, combined, at each snapshot you've captured."
                valueLabel="Kudos"
                points={aggregateSeries.map((point) => ({
                  capturedOn: point.capturedOn,
                  value: point.totalKudos,
                }))}
              />
            )}
            {selectedMetric === "subscribers" && (
              <TrendChart
                title="Subscribers"
                description="People subscribed to you as an author, across your works, at each snapshot you've captured."
                valueLabel="Subscribers"
                points={aggregateSeries.map((point) => ({
                  capturedOn: point.capturedOn,
                  // totalUserSubscriptions is required on AggregateSeriesPoint
                  // (TECH_DEBT.md, 2026-08-09) - the `?? 0` fallback that used
                  // to guard the old optional typing is now provably dead.
                  value: point.totalUserSubscriptions,
                }))}
              />
            )}
          </MetricToggle>
        </div>
      )}

      {perWorkSeries.length > 0 && (
        <WorkComparisonSection
          perWorkSeries={perWorkSeries}
          earliestPostYear={earliestPostYear}
          username={username}
        />
      )}
    </div>
  );
}
