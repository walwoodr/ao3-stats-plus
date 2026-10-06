# Retrospective: five-plan cadence cycle (bookmark feed through date-range slider)

Date: 2026-10-05
Covers: `main` from the last retro (`docs/retros/2026-08-06-consultation-gaps-and-comparison-graph-cycle.md`,
2026-08-06) through the current `HEAD` (2026-10-01's `d6a87a8`), 231 commits.
Evidence base: `git --no-pager log`/`git show`/`gh run list`/`gh run view` on the
commits and CI runs below, the five completed plan docs named below, `TECH_DEBT.md`
(2047 lines — grown from 606 at the last retro), `ROADMAP.md`, a live local
`bundle exec rspec` run, and a live local `npx vitest run --coverage` run
(jsdom project).

**Trigger:** the mandatory deployment/plan-cycle cadence check in
`~/.claude/SDLC_PROCESS.md`'s "Starting a task" section — 5 completed plan
docs (`bookmark-notes-feed.md`, `chart-synced-data-table.md`,
`chart-axis-comparison-and-table-orientation-batch.md`,
`date-hierarchy-grouping.md`, `date-range-slider-month-granularity.md`) have
finished Testing/Implementation/Review since the last retro, with the user
about to start a new chart/table-polish plan on a fresh branch. This is
exactly the scenario the broadened cadence rule (itself a recommendation from
the last retro) exists to catch — and notably, it fired correctly this time.

## What shipped

Five feature cycles, each with its own Discovery/Planning-stage sign-off
section (see "What went well" below) and Testing-before-Implementation:

1. **Bookmark notes feed** — a new `/u/:username/bookmarks` page: a
   cross-work aggregated, paginated bookmark-notes list with DOMPurify-sanitized
   rich HTML, an optional `WorkPicker`-driven filter, and a conditional
   per-row work-identity glyph (Decision D5).
2. **Chart synced data table** — replaced the Recharts hover tooltip across
   all three chart types with a below-figure synced, bidirectionally
   cross-highlighted data table (transposed: time as columns), native-table
   accessibility as the fallback instead of an sr-only shadow table.
3. **Chart axis/comparison/table-orientation batch** — a real elapsed-time
   (not ordinal) x-axis scale, a table row/column orientation toggle, and
   related comparison-view work.
4. **Date-hierarchy grouping** — year/month/day visual grouping overlays on
   chart x-axes (dashed year rules, month span labels) and a three-tier
   year/month/day table header, via a dedicated design-options session.
5. **Date-range slider, month granularity** — extended `DateRangeSlider`
   from whole-year to year+month granularity on `WorkComparisonSection`.

**Deployment status, confirmed not assumed:** no evidence of an actual
Deployment-stage run (production push + health check) anywhere in this
231-commit window — no deploy-shaped commits, no `TECH_DEBT.md`/retro entries
describing a live push, and GitHub Actions CI (see below) has been failing
on every single push for the entire window, which would ordinarily be a
gate. Treat everything above as **merged to local `main`, not confirmed live
in production** — the same caveat the last retro raised about `origin/main`
drift, now compounded by an entire additional cycle of unpushed/unverified
work. This is worth the user's attention before — not after — the next
chart/table-polish cycle adds still more on top.

## Central finding: CI has been red for the entire cycle, and the red is not uniform

The 2026-08-06 retro inherited a known CI failure (flagged 2026-08-28, during
this window) with a diagnosed cause and fix (`frontend-lint-and-unit` missing
a Playwright-browser-install step). That specific fix **was applied**
(`.github/workflows/ci.yml:114-115` now has the `Install Playwright browsers`
step) — but `gh run list` shows **every one of the last 10 pushes to `main`,
through 2026-10-01, still failing CI**, for two different and apparently
newer reasons than the one that was fixed:

1. **A genuine CI-only Vitest failure, confirmed not to reproduce locally.**
   The 2026-10-01 run's `Frontend (ESLint + Vitest)` job fails with:
   `[vitest] No "renderProgressBanner" export is defined on the "./banners"
   mock. Did you forget to return it from "vi.mock"?` in
   `src/bookmarklet/entrypoint.test.ts`. Ran this exact file locally
   (`npx vitest run src/bookmarklet/entrypoint.test.ts`) — **11/11 pass,
   clean.** This is a real, reproducible CI-environment-only discrepancy
   (plausibly a module-mock-hoisting/caching difference under CI's Node
   version — note the same run logs a Node 20→24 deprecation-forced-upgrade
   warning for `actions/checkout@v4`/`actions/setup-node@v4`, which is at
   least a plausible contributing factor, not yet confirmed as the cause).
2. **42 failed Playwright e2e tests across all three browsers**, including
   the same `home.spec.ts` "home page loads and renders the app heading"
   failure flagged as an open hypothesis back on 2026-08-28 ("dev-server-not-
   ready-in-time under CI load," never confirmed) — now also dragging down
   every `accessibility.spec.ts`/`bookmarkFeed.accessibility.spec.ts` test in
   all three browsers (14 distinct specs × 3 browsers), strongly suggesting
   the dev server genuinely isn't coming up for this job at all, not a
   narrow, isolated flake.

**This is the single most important process finding of this retro.** Five
full feature cycles' worth of Testing/Implementation/Review/Preview work
landed on `main` while CI sat red the entire time, and each time a
Deployment-adjacent pass touched the subject, it correctly diagnosed "this
specific failure is pre-existing/unrelated to my change" and moved on — true
in each individual instance, but the cumulative effect is that nobody ever
treated "CI is red" as its own task requiring a dedicated fix pass. The
2026-08-28 entry even named this explicitly ("needs a dedicated Maintenance
pass to reproduce and diagnose") and that pass never happened before two
*new* CI-only failure modes piled on top of the old ones. Recommend: the next
piece of work — ahead of or alongside the chart/table-polish plan — should be
a dedicated Maintenance pass that gets CI itself green, not just the local
suite. A CI gate that's been red for 2+ months stops functioning as a gate
at all; every Review/Deployment pass has to manually re-litigate "is this
failure mine" instead of trusting a green baseline.

## Coverage baseline check (CODE_STANDARDS.md, 85%)

**Backend: passes, 90.02% line coverage** (`bundle exec rspec`, live run just
now: 323 examples, 0 failures; SimpleCov `"rails"` profile — 379/421 lines).
Consistent with the last retro's 89.65%; still comfortably over baseline, no
new gaps flagged.

**Frontend: comfortably over baseline where measured (96.27% statements /
89.86% branches / 98.03% lines on the jsdom project), but the underlying
coverage-attribution bug flagged at the *last two consecutive retros*
(2026-07-31 and 2026-08-06) was never revisited and remains unfixed** —
confirmed via `grep` that `TECH_DEBT.md` has no entry referencing the
coverage-attribution bug after the 2026-08-06 retro's own write-up. The known
mechanism (Vitest's live in-memory `CoverageMap` silently dropping certain
files from the printed per-file table while the aggregate stays correct) is
unchanged; `vite.config.ts` still has no dedicated fix for it. Running with
`--project='!storybook*'` (excluding the slow browser project) avoids the
confirmed trigger for the specific omission pattern previously documented,
and the 96%+ number above should be reasonably trustworthy as a result — but
this has now been flagged three retros running without anyone spending
Maintenance time on it. Test-file count has grown from 50 (last retro) to
**123** `.test.ts(x)` files, meaning whatever residual attribution risk
exists is being exercised by a much larger, more consequential body of tests
than before. Recommend treating this as a concrete Maintenance task this
cycle, not a fourth deferral — the 85% baseline check is only as credible as
the tool producing the number.

## TECH_DEBT.md backlog health

2047 lines now (was 606 at the last retro — roughly 3.4x growth, similar
rate to last cycle's ~3x). The backlog shows real, substantive closure work,
not just accumulation — numerous entries are resolved-with-strikethrough
after genuine root-cause investigation (e.g. the three-round bookmark-scraper
selector saga, the five-round Recharts tick-collision saga, a dozen
test-authoring-defect batches each confirmed red→green). This project's
"verify against a live/primary source, not a secondary one" discipline is
visibly maturing — the bookmark-scraper entries explicitly correct an earlier
"confirmed against GitHub source" claim with "actually confirmed against a
real fetched live page," a good example of exactly the
`feedback_verify_dont_trust.md` lesson being applied and then *re-applied
more rigorously* after an initial near-miss.

That said, the "triage TECH_DEBT.md as its own task" recommendation from the
last retro was not acted on — the backlog has grown by another ~1,400 lines
with no consolidation pass. Candidates worth prioritizing now, in addition to
the coverage-attribution bug above:
- **The Prettier-enforcement gap** (2026-09-14 entry): formatting drift
  reached CI (not just a local annoyance) because `CODE_STANDARDS.md`'s
  pre-commit guardrail hook only checks ESLint/RuboCop, never Prettier,
  despite the Code standards section naming "ESLint + Prettier must pass."
  Flagged explicitly as "a recurring pattern, not a one-off" with a named
  fix (add a Prettier `--check` step to the hook) that requires a
  **global** `~/.claude/CODE_STANDARDS.md` update since the hook is defined
  there, not per-project. Still open.
- **Two 09-29 Maintenance findings about the shipped date-hierarchy-grouping
  mockup parity** (table year/month header color not matching the locked
  mockup; month label colliding with the Y-axis "0" tick for an edge-case
  lead-in) — both explicitly deferred as "Planning should make an explicit
  call" / "out of scope for this targeted fix." Reasonable candidates for the
  upcoming chart/table-polish plan to actually close, since that plan is
  precisely about this surface.
- **Two Review (adversarial) findings from the 2026-09-27 synced-table work**
  (a latent duplicate-`dateKey` header/body misalignment; an O(n²)
  `flattenDateAxisRows` re-render cost) — both correctly judged low-urgency
  at current personal-tool scale, but worth a second look if the upcoming
  polish work touches `SyncedDataTable.tsx`/`SyncedDataTableHeader.tsx`
  directly, since fixing them in passing would be cheaper than a dedicated
  pass later.

## What went well

- **The consultation sign-off discipline from the last retro held, across
  all five plans.** Every one of the five plan docs in scope here
  (`bookmark-notes-feed.md`, `chart-synced-data-table.md`,
  `chart-axis-comparison-and-table-orientation-batch.md`,
  `date-hierarchy-grouping.md`, `date-range-slider-month-granularity.md`)
  has an explicit "Decisions resolved"/sign-off section, and
  `date-hierarchy-grouping.md` in particular went through a dedicated
  design-options Artifact session (three mocked treatments against the
  account's real hard case) before Planning — exactly the escalated rigor
  the last retro's "Memory-worthy" section asked for. No repeat of the
  WorkPicker/USDS-shapes unconsulted-aesthetic-decision pattern was found in
  this window.
- **Rigorous root-causing over guessing, repeatedly, under real pressure.**
  The five-round Recharts tick-collision saga (`TECH_DEBT.md`, 2026-09-25)
  and the three-round bookmark-scraper selector saga are both examples of
  this project consistently re-deriving against the actual installed
  library/live page source rather than settling for a plausible-looking fix,
  even after multiple prior "resolved" claims turned out incomplete. The
  standing "don't edit tests to force a pass" rule was also applied
  correctly and repeatedly (multiple `[not fixed here per this stage's
  standing rule]` → resolved-next-stage pairs in `TECH_DEBT.md`), keeping
  Testing/Implementation's roles cleanly separated.
- **Real production-build Preview catches bugs unit tests structurally
  can't.** Both the Y-domain-rounding bug and the lead-in tick-label
  clipping bug (2026-09-25) were only caught by a real Preview run against
  real account data (38 works, dates back to 2014) — the chart test suite's
  fixtures skewed toward small/round numbers and mid-chart positions. The
  Preview stage is earning its mandatory, non-optional status in this
  process.

## What to change

1. **Get CI itself green before or alongside the next cycle's Implementation
   work, as a dedicated Maintenance task** — not another "pre-existing,
   unrelated to my change" annotation. Two concrete, separable sub-problems:
   the CI-only `entrypoint.test.ts` mock-resolution failure (confirmed not
   to reproduce locally — investigate the Node 20→24 forced-upgrade angle
   first) and the e2e job's systemic home-page/accessibility-spec failures
   (confirmed to affect ~14 distinct specs × 3 browsers, not an isolated
   flake — needs an actual reproduce-under-CI-load investigation, which a
   purely local pass can't do).
2. **Close the Prettier-enforcement gap in the global pre-commit hook**, per
   the 2026-09-14 TECH_DEBT entry's own fix proposal — this is a
   `~/.claude/CODE_STANDARDS.md` change (the hook is defined globally), worth
   raising with the user directly since it affects every project, not just
   this one.
3. **Triage `TECH_DEBT.md` for real this time** — it was recommended last
   retro and skipped; now at 2047 lines. Doesn't need to be exhaustive, but
   at minimum the four items named in "TECH_DEBT.md backlog health" above
   are concrete enough to close or explicitly re-scope into the upcoming
   chart/table-polish plan.
4. **Confirm the real state of `origin/main` / whether anything has actually
   been deployed**, before starting new work — this was flagged as unresolved
   at the last retro and the gap has only widened (an entire additional
   undeployed cycle on top). If the network-access blocker from last retro
   is still the cause, say so explicitly rather than let "shipped" keep
   meaning "merged locally" by default.

## Memory-worthy (flagging, not saving)

Nothing new rises to the level of a durable, generalizable "how this user
likes to work" lesson distinct from what's already captured in
`feedback_verify_dont_trust.md`, `feedback_honest_uncertainty.md`,
`feedback_precise_attribution.md`, and `feedback_ui_design_input.md` — this
cycle's findings are concrete process/tooling gaps (CI, Prettier
enforcement, coverage attribution) rather than new interpersonal-working-style
lessons. The closest candidate is reinforcing, not adding to,
`feedback_verify_dont_trust.md`: the bookmark-scraper saga's own
self-correction ("verified against GitHub source" → "that was still wrong,
verified against a real live-fetched page instead") is a good illustration
of applying that lesson a second, stricter time after an initial near-miss,
but it doesn't change the lesson's content — not flagging as a separate
memory update.

## Suggested file changes arising from this retro

Recommendations only, not applied — flagged for the user's decision per this
project's standing convention:

1. `~/.claude/CODE_STANDARDS.md`'s Enforcement section: add a Prettier
   `--check` step to the pre-commit guardrail hook description, alongside
   the existing ESLint/RuboCop checks, closing the gap the 2026-09-14
   TECH_DEBT entry named.
2. Project-local: prioritize a dedicated CI-green Maintenance pass (see "What
   to change" #1) ahead of or alongside the next chart/table-polish plan.
3. Project-local: a `TECH_DEBT.md` triage pass, scoped at minimum to the four
   items named in "TECH_DEBT.md backlog health."
