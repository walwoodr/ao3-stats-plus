# Retrospective: chart-polish-batch-2, CI stabilization, and the new Ubuntu-26.04 Ruby break

Date: 2026-10-22
Covers: `main` from the last retro's scope boundary (`docs/retros/2026-10-05-chart-table-polish-cadence-cycle.md`,
which covered through `d6a87a8`/the chart-table-polish-batch's early commits) through the
chart-table-polish-batch's conclusion at `cddbe23`, then `cddbe23..HEAD` (`c2190fc`), 23 commits
in the primary window plus the batch's closing commit as context.
Evidence base: `git log`/`git show`/`git diff --stat`, `gh run view` on the two most recent
real CI pushes, `TECH_DEBT.md` (now 669 lines, was 2047 at the last retro), a live local
`bundle exec rspec` run, a live local `npx vitest run --coverage --project='!storybook*'` run,
and `docs/plans/chart-table-polish-batch.md`.

**Trigger:** the mandatory deployment/plan-cycle cadence check in
`~/.claude/SDLC_PROCESS.md`'s "Starting a task" section — 5 deployment-adjacent cycles have
landed on `main` since the 2026-10-05 retro (see "What shipped" below), well past the 3-deployment
threshold, with no Retrospective run since.

## What shipped

1. **Chart-table-polish-batch, concluded** (`cddbe23`, the tail of a batch the last retro's
   window only partially covered) — closed out by fixing a Review-adversarial-caught defect: a
   missing `>30`-point engagement gate on the dot-thinning logic (item 7), with its own real
   boundary-condition tests (`ebd37e8`) added first. This commit predates this retro's primary
   diff window but is included here as closing context, since the last retro explicitly deferred
   judging it.
2. **4-item Maintenance batch** (merged via `integrate-batch2-and-ci-fix`, `fc8eef3`): date-range
   slider bounds now derived from selected works rather than account history (`63af1ee`); the
   per-work Bookmarks tab's charts now receive a threaded `windowStartEpoch` (`365836b`); an
   all-zero-chart empty state (`b499b67`) that Preview feedback expanded into a blue info-box
   design applied consistently across all three chart types, with a dedicated dark-mode/baseline
   alignment follow-up (`d0d0224`, `fbfa95b`); and left-padding removed from the synced table's
   scrollable region (`1edb5ca`).
3. **Second, 3-item tech-debt Maintenance batch** (same merge): a left-edge month-label/Y-axis
   collision guard (`acd0b1c`); the hardcoded `MAX_REAL_AXIS_TICKS` constant replaced with a
   per-breakpoint cap (`e5419f4`), later Preview-verified against a real production build at both
   375px (3 ticks) and 1024px (6 ticks) and marked resolved in `TECH_DEBT.md` (`5ff7a38`); and a
   proper cancel handle for `SyncedDataTable`'s auto-scroll animation (`fea8362`).
4. **The long-standing CI-red-state fix** (`fix/ci-red-state-2026-10`, merged via the same `fc8eef3`):
   fixed the Storybook-in-Vitest-browser-mode missing chromium install and stale
   Vitest/e2e assertions (`a3c64f2`), recovered from three previously stalled Maintenance
   attempts' stash. **Confirmed green on a real push** (run #39473577763: Backend and Playwright
   e2e jobs both passed) — the first real-push confirmation this specific failure mode has had
   since it was first flagged 2026-08-28.
5. **Follow-up CI Vitest-hang fix** (`fix/ci-vitest-hang-2026-10`, `c2190fc`, HEAD of `main`):
   root-caused to an open upstream Vitest bug (`vitest-dev/vitest#10831`) rather than the
   `/dev/shm`/Chromium-flag hypothesis that was investigated and explicitly ruled out on two
   independent grounds first. Mitigated via `browser.fileParallelism: false` plus a 30s
   test/hook timeout as defense-in-depth. **Confirmed FIXED on a real push** (run #39722579450:
   the previously 60+-minute-hanging Vitest job completed in 3m26s).

**Net CI picture after this cycle: 3 of 4 now-distinct failure modes are confirmed green on real
pushes; the 4th is new and still red** (see next section). This is real, verified progress on the
single biggest finding from the last retro ("get CI itself green ... as a dedicated Maintenance
task") — not merely claimed locally, the way some of the preceding cycle's work was.

## A new, currently-unaddressed CI failure: Ubuntu 26.04 dropped `ruby-3.3.5`

The same push that confirmed the Vitest-hang fix (run #39722579450) also newly failed the
`Backend (RuboCop + RSpec)` job, before RuboCop or RSpec even ran:

```
Error: Unavailable version 3.3.5 for ruby on ubuntu-26.04
ruby-3.3.12 is available on ubuntu-26.04: use ruby-version: '3.3.12', or '3.3' ...
Cause: Unexpected HTTP response: 404
```

Root cause confirmed from the run's own annotations: GitHub's `ubuntu-latest` label began
migrating to Ubuntu 26.04 on 2026-10-19 (`actions/runner-images#14748`), and only the latest
patch of each Ruby series is built for the new image. `backend/.ruby-version` still pins
`ruby-3.3.5`. This is unrelated to any of the three other tracked CI failure modes — a pure
runner-image/toolchain-availability break, not an app or test defect — and was **not yet logged
in `TECH_DEBT.md`**, which I verified by grep (no match for "ubuntu-26.04", "ruby-3.3", etc.)
before logging it myself as part of this retro's evidence-gathering. Candidate fix is small:
bump `backend/.ruby-version` to `3.3.12` (or `3.3` to float the latest patch) and confirm
`Gemfile.lock`/native extensions still build under it.

## Coverage baseline check (CODE_STANDARDS.md, 85%)

**Backend: 90.02% line coverage** (`bundle exec rspec`, live run: 323 examples, 0 failures;
SimpleCov "rails" profile, 379/421 lines) — identical to the last retro's number. This is
because **this entire cycle touched zero backend files** (`git diff --stat cddbe23..HEAD` shows
0 files under `backend/`) — every item in both Maintenance batches, both CI fixes, was
frontend/CI-config/docs. Not a problem in itself, but the number is stale by construction, not a
sign of steady-state backend quality this cycle; the next backend-touching cycle should re-check
it rather than assume it held.

**Frontend: comfortably over baseline in aggregate** (96.21% statements / 89.91% branches /
97.08% functions / 97.99% lines, live `npx vitest run --coverage --project='!storybook*'` run).
The 2026-07/08-flagged coverage-attribution bug (certain files silently dropped from the printed
per-file table) is sidestepped by excluding the storybook project, consistent with prior retros'
documented workaround.

That said, **a few individual files sit well under the 85% file-level baseline on branches**,
even though the aggregate clears it comfortably — worth calling out explicitly rather than
letting the aggregate mask them:
- `MetricDisclosure.tsx` — 50% branches
- `chartOrientation.ts` (listed as `...orientation.ts`) — 50% branches
- `useChartColors.ts` (listed as `...hartColors.ts`) — 80% branches

These read as small files with one or two genuinely rare/default-case branches rather than
systemic undertesting, but they're real, named gaps, not a vague "coverage is probably fine."

## TECH_DEBT.md backlog health

**The last retro's "triage TECH_DEBT.md for real this time" recommendation was acted on** —
`c9af03b` ("chore: triage and cut TECH_DEBT.md from 2047 to 416 lines", 2026-10-13) did exactly
that, and the project's own `CODE_STANDARDS.md` now documents this as a recognized periodic
discipline (hence the max-file-length exemption approved 2026-10-19). This is a genuine
turnaround from the prior cycle, where the same recommendation had already been skipped once
before being repeated. The backlog has since grown organically back to 669 lines / 65 open
entries through real review/maintenance findings in this cycle — healthy churn, not unchecked
accumulation.

**Verified, per the coordinator's specific flag: no evidence of an unlogged third stale-entry
case this cycle beyond the two already named.** Two confirmed instances of already-shipped work
left unstruck in `TECH_DEBT.md` were found and corrected in this window (one just outside the
strict commit range but part of the same backlog's lifecycle, one squarely inside it):
- `8b25c77` (2026-09-23): two entries (a DOMPurify form-element gap, unwindowed bookmark-feed
  pagination) had been fixed weeks earlier but never marked resolved.
- `5ff7a38` (2026-10-21, inside this cycle): `MAX_REAL_AXIS_TICKS_BY_BREAKPOINT`'s "not yet
  Preview-verified" caveat was struck through only after a live Preview run supplied the actual
  375px/1024px measurements that answered it.

Both were caught specifically because the agents involved were told to verify an entry against
real code/evidence before acting on it, not because the gap is self-evident from reading
`TECH_DEBT.md` alone — see "What to change" below.

## Process signals worth naming explicitly

- **Review (adversarial) continues to catch real defects a green full suite does not.** Two
  concrete instances touch this window directly: the missing `>30`-point engagement gate
  (`cddbe23`, closing out the prior batch) and a vacuously-passing regression fence in
  `entrypoint.test.ts` (`04c5d42`, 2026-10-19) — the test's own "leak detector" assertion is
  unreachable on the failure path because an earlier assertion dies first, so it would pass even
  if its stated intent were violated, despite still correctly going red if the actual fix is
  reverted. Both were found, not missed, by the adversarial pass specifically — consistent with
  the two-posture Review design doing its job as intended, not evidence either posture needs
  rework.
- **Rate-limit/stream-stall disruptions are real and left a visible mark in-repo, not just
  anecdotally.** The CI-red-state fix's own commit message (`a3c64f2`/the 2026-10-15
  `TECH_DEBT.md` entry) explicitly describes recovering "from three stalled Maintenance attempts'
  stash via `git stash apply`," then having to re-derive two of five e2e fixes against decisions
  that had landed on `main` in the interim. The stash-recovery discipline worked — nothing was
  silently lost, and staleness introduced during the gap was caught and corrected rather than
  blindly reapplied — but it's real added cost (re-verification work that wouldn't exist in an
  uninterrupted run), not a non-event.
- **Preview is still earning its mandatory, non-optional status.** The `MAX_REAL_AXIS_TICKS_BY_BREAKPOINT`
  real-viewport verification gap existed purely because no one had checked actual tick counts on a
  real production build at 375px/1024px; Preview supplied exactly those numbers and let the entry
  close with confidence instead of further hand-wringing.

## What went well

- Three of four distinct CI failure modes are now confirmed green **on real pushes**, not just
  claimed locally — a meaningfully higher bar than the previous retro found, and direct follow-
  through on that retro's top recommendation.
- The TECH_DEBT.md triage recommendation was acted on this cycle, after being skipped once
  before.
- Preview-driven real-viewport verification closed a genuine open question (`MAX_REAL_AXIS_TICKS_BY_BREAKPOINT`)
  with actual measurements rather than a plausible-sounding guess.
- Maintenance continues its established discipline of flagging latent follow-ups it deliberately
  didn't fix inline (e.g. the month-label right-edge mirror case) rather than silently expanding
  scope or losing the thread.

## What to change

1. **Fix the new Ruby 3.3.5/Ubuntu-26.04 CI break** (logged this retro) — bump
   `backend/.ruby-version` to `3.3.12` or `'3.3'`, verify `Gemfile.lock`/native extensions still
   build. Small, well-understood fix; worth doing before or alongside the in-flight
   `fix/tech-debt-batch-2026-10` work lands, so CI doesn't stay permanently red on a fourth front
   the moment that work is ready to merge.
2. **The stale-TECH_DEBT-entry problem has now recurred twice** (verified in this retro, both
   caught only because the agents involved were explicitly told to check). This is a process gap,
   not a one-off: make "verify an entry against current code/evidence before acting on it or
   presenting it as still-open" an explicit, durable instruction in `sdlc-maintenance.md` and/or
   `sdlc-retrospective.md`'s own evidence-gathering step, rather than relying on it being caught
   by chance each time.
3. **Frontend branch-coverage dips in specific small files** (`MetricDisclosure.tsx`,
   `chartOrientation.ts`, `useChartColors.ts`, all at 50-80% branches) are worth a look next time
   those files are touched, even though the aggregate clears 85% comfortably.
4. **The Prettier pre-commit enforcement gap flagged at the last two retros (2026-09-14,
   2026-10-05) is still open** — `~/.claude/CODE_STANDARDS.md`'s Enforcement section still only
   checks ESLint/RuboCop, never Prettier, despite the Code standards section naming both. Several
   `style: apply prettier formatting to ...` cleanup commits in this window's history confirm
   drift is still reaching commits, not just a theoretical gap. This is a global, not project-
   local, file — flag directly to the user again rather than let a third retro repeat the same
   finding with no action.
5. **Watch item, not yet a confirmed pattern:** this is the second cycle running with evidence of
   rate-limit/stream-stall mid-task terminations costing real re-verification work. One cycle of
   stash-recovery succeeding is not itself proof a process change is needed — but if a third cycle
   shows the same cost, consider a lighter-weight standing checkpoint/commit discipline mid-batch
   (more frequent intermediate commits during long Maintenance batches) rather than relying on ad
   hoc stash recovery each time.

## Memory-worthy (flagging, not saving)

Nothing new rises to a durable, generalizable "how this user likes to work" lesson distinct from
what's already captured. The two stale-TECH_DEBT-entry catches this cycle are a direct,
repeated demonstration of `feedback_verify_dont_trust.md` already in force — reinforcing, not
revising, that lesson's content. Not flagging a separate memory update.

## Suggested file changes arising from this retro

Recommendations only, per this project's standing convention — not applied here except where
noted:

1. **Applied as part of this retro's evidence-gathering**: logged the new Ruby 3.3.5/Ubuntu-26.04
   CI break in `TECH_DEBT.md` (it was confirmed absent before being added).
2. Project-local: a small Maintenance fix for `backend/.ruby-version` (see "What to change" #1).
3. `~/.claude/sdlc-maintenance.md` and/or `~/.claude/sdlc-retrospective.md`: add explicit
   "re-verify a `TECH_DEBT.md` entry against current code/evidence before treating it as open"
   guidance (see "What to change" #2) — this has now caused two real but low-cost near-misses.
4. `~/.claude/CODE_STANDARDS.md`'s Enforcement section: add a Prettier `--check` step to the
   pre-commit guardrail hook, per the still-open 2026-09-14 `TECH_DEBT.md` entry — repeating the
   last retro's recommendation since it remains unaddressed.
