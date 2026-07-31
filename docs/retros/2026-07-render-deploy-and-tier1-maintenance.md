# Retrospective: Render deployment + Tier 1 maintenance batch

Date: 2026-07-31
Covers: `main` from `16b16e9` through `ea4308d` (23 commits), two partly-concurrent
threads — Render hosting/deployment (the bigger arc) and a 6-item Tier 1
tech-debt maintenance batch. Evidence base: `git log`/`git show` on the
commits below, `TECH_DEBT.md`, `PRIORITIES.md`, `README.md`, `render.yaml`,
`backend/spec/deployment/render_yaml_spec.rb`, CI config
(`.github/workflows/ci.yml`), and frontend/backend test config.

**Tooling note:** this retro's assigned toolset (Read/Bash/Write) does not
include the TaskList tool, so task-completion state was cross-checked via
`PRIORITIES.md`'s explicit task-ID references (T1–T5, I1–I7, R1–R8 for the
deployment plan; Tier 1's 6 items) and commit messages rather than read
directly from TaskList. Everything below is grounded in git evidence, not
just the task summary provided at kickoff — including two places where that
summary undersold what the evidence shows (see "Undocumented plan artifact"
below).

## What shipped

**Thread 1 — Render deployment** (`a673349`…`8953a85`, plus two docs
commits after): Testing wrote 5 specs red (`a673349`, `7c008c7`, `b46925e`,
`21a36dc`, `81df284`); Implementation made 7 tasks green (`2716b3a`,
`05e7565`, `e88fdf8`, `8a3f13a`, `9379c74`), authoring `render.yaml` as a
Blueprint (Docker backend on Starter, Basic Postgres, static-site frontend,
split-topology origins). Review found and a follow-up fix resolved a
critical `staticSites:` schema bug (`7ac39e3`). After the user completed
Render's actual dashboard Blueprint flow, a real-world cost surprise
($17.50 vs. the ~$13/mo estimate) led to a `diskSizeGB` fix (`8953a85`).
Live `onrender.com` verification (health check, DB-backed GraphQL, CORS
both directions, SPA routing, bookmarklet build) was reported as passing.

**Thread 2 — Tier 1 maintenance batch** (`16b16e9`…`3f49316`, 6 items,
tracked in `PRIORITIES.md`): RatioChart lead-in baseline (`16b16e9`),
DashboardPage token-clearing on transient errors (`fa1b2b4`), InstallPage
clipboard test (`4e92dba`), scrapeStats.ts one-work-per-fandom bug
(`3a366d1`, later corrected by `3a0233a`), two a11y failures plus a WebKit
scoping decision (`cc55bcb`… `b5f4c8b`, `ce8ea3a`), and the bookmarklet
drag-install bug (`3f49316`). `PRIORITIES.md` marks all 6 done.

Both threads are reflected accurately in `TECH_DEBT.md`, which now runs to
~220 lines with a real mix of open (Tier 2/3, explicitly deferred) and
resolved-with-history entries — including the two false-green regressions
below, left in place with their resolution as a record rather than deleted.

## What went well

**"Verify, don't trust" caught two real regressions, concretely, not just
in spirit.** Both are visible in the diffs, not just claimed in commit
messages:

- `7ac39e3`: Review's finding that `staticSites:` isn't a real Render
  Blueprint key was independently re-verified against Render's live docs
  before being fixed — not just accepted from the review pass. The commit
  message spells out the traced root cause (Testing wrote `81df284`
  without web access) rather than just patching silently.
- `3a0233a`: Review's finding that AO3 nests works one level deeper than
  `3a366d1` assumed was independently re-verified by re-fetching
  `otwcode/otwarchive`'s actual `index.html.erb` a second time — the retro
  brief describes this as "didn't just trust the review agent's claim,"
  and the commit message confirms the same evidence (the real file) was
  fetched again rather than taken on faith. This one mattered more than
  the render.yaml case: the "fix" in `3a366d1` didn't just fail to help,
  it broke scraping outright (`parseWorks` returned `null` for every
  fandom, confirmed by the commit's own "15/20 tests red" note before the
  real fix landed) — a caught regression, not a caught near-miss.

**Both Testing and Implementation flagged their own uncertainty instead of
guessing silently, and it's visible in both commit messages and
`TECH_DEBT.md`.** `3a366d1`'s commit message says outright: "I could not
get direct access to a live AO3 stats page... the fix is grounded in
strong circumstantial evidence, not a captured real page, and is worth a
sanity check." `81df284`'s spec file header says it was "written without
web access." Neither pretended more confidence than it had. This is worth
reinforcing precisely because it's what made the caveats visible enough for
Review to find and close — a silent guess would have left no thread to
pull.

**Test-first discipline surfaced the second scrapeStats.ts regression
before it shipped**, not after: `3a0233a`'s commit message documents
confirming the corrected fixtures fail against the (still-wrong) prior
selector first (15/20 red), then fixing `parseWorks` and confirming green
(20/20) — the same red-before-green discipline Testing used originally was
reapplied at the fix-the-fix stage, not skipped because "we already know
what's wrong."

## What to change

### 1. The false-green pattern needs a structural closer, not just a logged caveat

Both regressions above share the same shape: a spec/fix encoded an
assumption about an *external* system (Render's real schema, AO3's real
markup) that Testing/Implementation could not verify live, the caveat was
logged to `TECH_DEBT.md` immediately in both cases, and the loop only
closed because Review happened to dig into that specific file. That's a
real success this cycle, but it's success by Review's thoroughness, not a
guaranteed mechanism — nothing currently *forces* a logged
external-assumption caveat to be re-verified before it ships, as opposed to
just sitting in the backlog like the many still-open Tier 2/3 items in
`TECH_DEBT.md`.

Concrete process recommendation: when Testing or Implementation encodes a
factual assumption about an external system's real shape without being
able to verify it live (no web access, no account access, etc.), it should
be tagged distinctly in *both* the code/spec comment and the `TECH_DEBT.md`
entry (e.g. a consistent `EXTERNAL-UNVERIFIED` marker) rather than logged
in the same prose style as ordinary deferred debt. Review's stage
instructions could then explicitly grep for that tag and treat it as a
mandatory re-verification item — not "one more thing that might be worth
digging into," but a required check before sign-off. This would have
caught both regressions by rule rather than by chance, and would apply
symmetrically to any future "spec validates against a self-defined shape"
situation, which `TECH_DEBT.md` itself already flags as an unresolved
residual risk (`spec/deployment/render_yaml_spec.rb` still validates
against a self-defined shape, so it still can't catch *future* Render
schema drift, even now that the current instance is fixed).

### 2. Planning's infra cost estimate missed a default it never enumerated

The ~$13/mo estimate ($7 Starter compute + $6 Basic Postgres) was correct
for what it named, but named compute only — `diskSizeGB` was never
mentioned, so Render's 15GB Basic-tier default (~$4.50/mo) showed up as a
live surprise in the Blueprint UI rather than being anticipated. This
wasn't a research failure exactly (the headline prices were "verified
against real pricing pages at the time" per the brief) — it was a scope
failure: the estimate didn't enumerate all billable dimensions (compute,
disk, bandwidth, add-ons), just the one that was top-of-mind.

Concrete process recommendation: when Planning estimates recurring
infrastructure cost for a platform it can't dry-run end-to-end (no CLI/API
access to actually create the resources and see a real bill), it should
either (a) explicitly enumerate every billable dimension the platform's
pricing page documents — compute, disk, bandwidth, backups, add-ons — and
state a number for each, or (b) explicitly caveat the estimate as
compute-only / partial, naming what wasn't checked. "~$13/mo" stated as a
single confident number, with no caveat, is what made the $17.50 figure
land as a surprise rather than a "yes, as flagged" confirmation. Pinning
`diskSizeGB` explicitly (rather than accepting a platform default) is also
a good general habit independent of the cost question — Implementation
ended up doing this anyway (`8953a85`), just after the surprise rather than
during Planning.

### 3. Coverage tooling gaps surfaced at Retrospective, not earlier — and one is a real gap, not just a check that was skipped

Two distinct issues, confirmed directly:

- **Backend has no coverage tool at all.** `backend/Gemfile` has no
  SimpleCov (or equivalent) entry, and `.github/workflows/ci.yml`'s backend
  job runs RuboCop + RSpec with no coverage step. The 85% baseline
  (`CODE_STANDARDS.md`) literally cannot be measured for `backend/` right
  now — not "coverage is low," but "coverage is unknown."
- **Frontend's coverage report silently under-reports.** `frontend/vite.config.ts`
  has no `test.coverage` block at all (confirmed by direct read — the
  `coverage.all`/explicit include/exclude mentioned in the newest
  `TECH_DEBT.md` entry as "tried" left no trace in the committed config,
  consistent with it not having fixed the problem). At least 12 files with
  real, passing `.test.ts(x)` files (`AppLayout.tsx`, `LandingPage.tsx`,
  `App.tsx`, `TokenEntryForm.tsx`, `useTokenStore.ts`, `useTokenFromUrl.ts`,
  `useStatsForUser.ts`, `ingestClient.ts`, `buildIngestPayload.ts`,
  `tokenStorage.ts`, `colorTokens.ts`, `constants.ts`) don't appear in the
  printed coverage table at all — the "91.79% statements" figure is real
  for the subset it covers, but is not the true whole-project number.
  Likely cause per the `TECH_DEBT.md` entry: Vitest's multi-project config
  (`test.projects: [...]`, jsdom project + Storybook/browser project) not
  merging v8 coverage attribution across projects — not a misconfigured
  `coverage.all`.

Neither of these was flagged until this retrospective, even though the
process has been test-first (Testing-before-Implementation) across the
entire cycle, meaning coverage *should* have been trivially high enough to
check all along. CI never runs a coverage step for either side, so nothing
would have surfaced this earlier without someone explicitly running
`--coverage` and looking at the *files listed*, not just the summary
percentage — which is exactly what happened, just at stage 8.

Concrete process recommendation: coverage tooling health (does it run at
all, does it attribute coverage across every source file with a
corresponding test file, not just a project subset) should be smoke-tested
once during Bootstrap or the first Testing-stage pass — a one-time check
that the tool actually counts a known file, not a full baseline
enforcement pass (that stays at Retrospective, per `CODE_STANDARDS.md`).
That would have caught the frontend multi-project attribution bug in week
one instead of at the end of a multi-week cycle, and would have surfaced
"backend has no coverage tool" as a decision to make (add SimpleCov?
explicitly accept no coverage visibility?) before ~20 backend commits
accumulated with no way to measure it. That decision is still open now —
adding SimpleCov is an out-of-stack gem addition requiring explicit
sign-off per `TECH_STACK.md`, so it's flagged here rather than added.

### 4. Thread 1's Planning stage never produced a committed plan doc — an inconsistency with this project's own convention

This project has a real, consistent `docs/plans/` convention: the
bookmarklet-entrypoint plan is a full committed doc
(`docs/plans/bookmarklet-entrypoint-and-hosting.md`, added in `bde20e6`),
and `sdlc-planning.md` requires a written plan with a task list. But no
`docs/plans/*.md` file for the Render/Docker/Postgres hosting decision
exists anywhere in git history (`git log --diff-filter=A -- 'docs/plans/*'`
shows only the one bookmarklet-plan commit). The render.yaml spec
(`81df284`) and `PRIORITIES.md` both reference "the finalized hosting
plan (`docs/plans/bookmarklet-entrypoint-and-hosting.md`'s Section 1 /
T5)" — but that file's actual Section 1 is "Happy path" for the
*bookmarklet entrypoint*, not Render hosting; there is no Render/Docker/
Postgres/cost content in it at all. That citation is stale or mistaken,
and currently dangling in a committed spec file's own header comment.

The deployment plan clearly existed as structured content (task IDs T1–T5/
I1–I7/R1–R8 are referenced consistently across `PRIORITIES.md` and commit
messages, so a TaskList-based plan was made), but it was never captured as
a durable, readable artifact the way this project normally does Planning
output. That's exactly the kind of document where the compute-only cost
caveat from finding #2 above could have been made visible in writing, and
its absence means there's no single place a future reader can go to see
what Planning actually decided and why for this thread — only
reconstructable from commit messages and `PRIORITIES.md`'s summary.

Concrete process recommendation: worth checking, next time a deployment
plan is finalized, that a `docs/plans/*.md` artifact gets written the same
way it does for feature plans — and fixing the stale citation in
`render_yaml_spec.rb`'s header comment now, since it currently points a
future reader at the wrong document.

### 5. Deployment stage: the adaptation was reasonable, but the mechanical verification work wasn't delegated to the tier meant to do it

No `sdlc-deployment` (Haiku-tier) invocation happened this cycle. Given
Render's Blueprint flow requires account creation, GitHub OAuth, and
dashboard secret entry — none of which is scriptable from this
environment — some adaptation was necessary, and letting the user do the
literal dashboard clicking while the main thread handled config fixes
(`8953a85`) is reasonable; `sdlc-deployment.md` as written doesn't cover
"the deploy mechanism itself requires a human at a browser."

But the *other* half of Deployment's job — the mechanical post-deploy
verification checklist (health check, DB-backed GraphQL response, CORS
both directions, SPA routing, bookmarklet build check) — is exactly the
kind of "routine, procedural, run-the-checklist" work `sdlc-deployment.md`
describes as Haiku's job, and per the retro brief it was done inline on
the main thread instead. That's not a correctness risk (the checks
happened and were reportedly grounded in real `curl`s against
`onrender.com`, not assumed), but it is a missed model-efficiency win of
exactly the kind `SDLC_PROCESS.md`'s tiering is meant to capture — the
main/planning-tier thread did Haiku-tier work by default rather than by
choice.

Concrete process recommendation: document this shape explicitly —
`SDLC_PROCESS.md` or `sdlc-deployment.md` should note that for a
platform requiring manual account/dashboard steps, the expected split is
(a) Implementation prepares the IaC config, (b) the user performs the
literal account/OAuth/dashboard actions and reports back the live URLs,
then (c) `sdlc-deployment` is still invoked at that point to run its
existing post-deploy verification checklist against those real URLs,
rather than skipping the stage's own agent entirely because part of it
couldn't be automated.

## Coverage baseline check (CODE_STANDARDS.md, 85%)

Cannot be verified as a number for either side right now:

- **Backend**: no coverage tool configured — 0% measurable, not 0%
  actual. This needs a decision (see #3 above) before it can be checked
  at all.
- **Frontend**: the only figure available (91.79% statements) is a
  confirmed *undercount* of the true project — at least 12 files with
  real passing tests are missing from the report entirely, so the true
  number is unknown but almost certainly different (likely higher, since
  those files have dedicated test files, but not verifiable until the
  multi-project attribution bug is fixed).

Flagging both explicitly per `CODE_STANDARDS.md`'s instruction to call out
under-85%-or-unmeasurable coverage by number and file, not note it in
passing — there is no reliable number to report yet, which is itself the
finding.

## TECH_DEBT.md backlog health

`TECH_DEBT.md` has grown substantially this cycle but is not just growing
unaddressed — of the entries logged or touched during this cycle, several
were fully resolved with their resolution history left in place (the
scrapeStats.ts double-regression entry, the WebKit tab-order decision, the
InstallPage clipboard root cause). What remains open skews toward
consciously-deferred, prioritized items (`PRIORITIES.md`'s Tier 2/3, e.g.
non-constant-time token comparison, `/ingest` auth/rate-limiting accepted
at personal-tool scale) rather than a directionless pile — the priority
tiering itself is a mitigation worth naming as working, not just a backlog
that only grows.

## Memory-worthy (flagging, not saving)

The following look like durable lessons about how this user likes to
work, worth considering for a feedback-type memory rather than just living
in this doc:

- **Strong, consistent preference for independently re-verifying a
  subagent's or reviewer's claims against primary sources** (Render's live
  docs, AO3's actual view template) **before accepting them**, rather than
  trusting a review pass's account at face value — demonstrated twice this
  cycle with concrete payoff (both were regressions, not false alarms).
- **Tolerance for, and apparent preference toward, honest uncertainty over
  confident guessing** when a subagent lacks the access to verify
  something (web access, live account/dashboard access) — both instances
  of this in the cycle were treated as good process, not a failure to
  route around.

## Suggested file changes arising from this retro

None applied yet — these are recommendations, not made unilaterally, since
they'd touch global process files (`~/.claude/SDLC_PROCESS.md`,
`~/.claude/agents/sdlc-review.md`, `~/.claude/agents/sdlc-planning.md`,
`~/.claude/agents/sdlc-deployment.md`) that apply beyond this one project:

1. `sdlc-testing.md`/`sdlc-implementation.md`: add guidance to tag
   external-system assumptions made without live verification
   (`EXTERNAL-UNVERIFIED` or similar) distinctly in both code comments and
   `TECH_DEBT.md`, rather than logging them the same as ordinary deferred
   debt.
2. `sdlc-review.md`: add a checklist step to grep for that tag and treat
   it as a mandatory re-verification item.
3. `sdlc-planning.md`: for infra cost estimates on platforms that can't be
   dry-run, require enumerating all billable dimensions (compute, disk,
   bandwidth, add-ons) or explicitly caveating which weren't checked.
4. `SDLC_PROCESS.md` / `sdlc-deployment.md`: document the expected shape
   for deploys requiring manual account/dashboard steps — prepare config,
   let the user do the unscriptable part, then still invoke
   `sdlc-deployment` for its post-deploy verification checklist against
   the real URLs.
5. Project-local: fix the stale plan citation in
   `backend/spec/deployment/render_yaml_spec.rb`'s header comment (points
   at the wrong doc/section), and consider whether the Render hosting
   decision should get its own retroactive `docs/plans/*.md` entry for
   the historical record.

Also project-local and not a process file: a decision is needed on
whether to add a backend coverage tool (e.g. SimpleCov) given
`TECH_STACK.md`'s sign-off requirement for new dependencies, and the
frontend's Vitest multi-project coverage attribution bug needs root-causing
independent of that decision.
