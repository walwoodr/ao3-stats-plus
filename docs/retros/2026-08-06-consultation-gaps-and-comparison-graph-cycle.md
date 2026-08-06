# Retrospective: consultation gaps across the comparison-graph work cycle

Date: 2026-08-06
Covers: `main` from `1d4ce18` (2026-07-31 retro) through `116469d` (2026-08-05),
121 commits. Evidence base: `git log`/`git show` on the commits below,
`docs/plans/*.md` (9 plan docs), `TECH_DEBT.md` (606 lines), `ROADMAP.md`, live
`bundle exec rspec` + `npx vitest run --coverage` runs, and the two process
files added earlier today
(`~/.claude/agents/sdlc-consultation-check.md`,
`~/.claude/SDLC_PROCESS.md`'s deployment-count trigger), plus the saved
feedback memory `feedback_ui_design_input.md`.

**Trigger:** this retro was requested directly by the user mid-session,
prompted by a specific concern — "a variety of UI decisions made based on
assumptions and not asking, despite my explicit instructions to consult with
me." It was not triggered by the deployment-count cadence rule (see "Are the
two new process changes well-targeted" below for why that rule wouldn't have
fired here anyway). Per the brief, this retro does not retroactively apply the
two process changes made today to past work — it evaluates whether they would
plausibly have caught what happened, and whether they're the right shape going
forward.

## What shipped (or, mostly, didn't yet ship)

Nine features/plan docs, in order: work-page enrichment (public
bookmarks/comments/chapter-tracking data model), memorable-token-and-recovery
(word-pair tokens, always-accept model), per-work comparison graph (WorkPicker
grouped checkboxes, DateRangeSlider, MultiSeriesTrendChart), a 12-error build
fix, several banner styling commits, per-work zero-basis dates, the USDS
10-slot color/shape scheme (plus a same-day shape correction), the
work-comparison-picker-redesign (MUI Autocomplete rebuild + persisted Zustand
store), and the work-comparison-picker-refinements (7 UI polish items) —
fully built, tested, and reviewed but explicitly **not yet deployed** per the
task brief (the user is on a network they can't push from).

**Important caveat surfaced by evidence, not assumption:** local `main` is
58 commits ahead of the last cached `origin/main` ref
(`e009915`, 2026-08-04 — mid-way through the USDS work, before the cap was
even raised to 10). A live `git fetch` in this environment also failed (no
network), so this can't be re-verified against the real current state of
`origin/main` right now — I'm flagging this rather than asserting it, per this
project's own "verify, don't trust" habit applied to my own evidence gaps. But
taken at face value, this means considerably more than "just the last
feature" is sitting unpushed: everything from the USDS cap-raise onward
(10-slot scheme, the shape correction, the entire picker redesign, and the
refinements) may not be live yet. If that's accurate, "shipped" in this
session's summary should be read as "built and merged to local `main`," not
"deployed to production" — worth the user confirming the real state of
`origin/main` next time they have network access, since it changes how much
is actually exposed to real use (and thus how urgent redeploying is).

## Central focus: consultation gaps

### Instance 1 — WorkPicker's original grouped-checkbox design (already documented)

Already captured in `feedback_ui_design_input.md`: the original `WorkPicker`
(multi-work comparison picker, `f3bc95a`, 2026-08-02) was built as a
grouped-checkbox-per-fandom list without asking the user's design preference
first. Confirmed directly against the plan doc
(`docs/plans/per-work-comparison-graph.md`): its "Resolved open questions"
section (Q1–Q6) — including Q1 ("replace the dropdown"), Q4 (fandom bulk-select
model), and the checkbox-list shape itself — are Planning's own reasoned
conclusions, not user-confirmed. Only two *narrower* decisions (A: redundant
color channel; B: MUI `Slider` for the range control) went through an actual
"Resolved design decisions" section with the header explicitly stating "both
design decisions resolved by user 2026-08-02." The picker's actual visual/
interaction pattern was never one of the two things asked about. When later
asked directly, the user had a fully detailed alternative spec ready
(Autocomplete-with-chips, click-header-to-select, inline pill removal,
type-to-filter, bordered "island" layout) — evidence this was a real,
pre-existing preference that should have surfaced proactively.

### Instance 2 — the USDS color/shape scheme (new finding, not previously documented)

`docs/plans/usds-dataviz-color-scheme.md` shows the same shape at a finer
grain. Its status line says two decisions were "confirmed by user 2026-08-04":
(1) consolidating the sibling dash-restyle item into this plan, (2) the CVD
verification mechanism (hardcoded matrices vs. a new dependency). Higher-level
parameters (cap ≈10, redesign-from-scratch, add a formal CVD requirement) were
"resolved by the user during Discovery" per the plan's own header. But the
**specific 10 shapes and colors** — including plus, star, and cross as three
of the ten marker shapes — were Planning's own computed choice, verified for
contrast/CVD-distance but never shown to the user for a "do these look right"
pass before Implementation built and shipped them.

The result: a same-day Maintenance correction (`fe01ab7`, 2026-08-04,
documented in the plan's own "Addendum") records that the user, on reviewing
the shipped feature, rejected plus/star/cross as "not basic geometric shapes"
and asked for hollow outlines of the existing diamond/triangle-up/
triangle-down instead. This is functionally the same failure mode as
Instance 1 — a visually consequential, purely aesthetic choice was computed
and shipped rather than surfaced for approval — just one level more granular
(exact shapes within an already-agreed cap, not the whole component pattern).
It happened *after* Instance 1 (2026-08-02) and *before* the feedback memory
was saved (2026-08-05), meaning it wasn't caught by anything at the time —
only by the user noticing after the fact, again.

### Instances checked and found NOT to be consultation gaps

- **Zero-basis-dates caption wording/placement** — properly consulted.
  `docs/plans/per-work-zero-basis-dates.md`'s header states plainly: "Three
  product decisions were resolved by the user via `AskUserQuestion` during
  Discovery (lead-in styling, missing-publish-date fallback, backfill
  messaging); two more were resolved during Planning (zero-dot color, visible
  caption)." This is exactly the pattern that should have applied to
  Instances 1 and 2 and didn't.
- **Banner styling changes** (icon-button restyle `082b38e`, box-shadow
  removal `ebd53c2`) — not an unconsulted-AI-decision at all. Both commits'
  `Authored-By` trailers show these were **Human**-authored changes (the user
  made the styling edits directly), with Claude only applying Prettier
  formatting and fixing test lookups afterward. The one AI-authored banner
  change in this window (`0547df9`, stacking banners vertically) is a
  functional bug fix (two banners were rendering on top of each other), not
  an aesthetic decision, and doesn't fit this pattern.
- **The deferred toggle-graph UI** — correctly *not* built. The work-page
  enrichment plan explicitly flagged it as needing its own consultation +
  Planning pass before any UI is built on it, and the plan's own
  Retrospective section (item 21) asks future-me to confirm that consultation
  happened before any graph UI shipped. Checked: no toggle-graph UI exists in
  this commit range: `ROADMAP.md`'s 2026-08-04 entry still lists it as
  deferred, correctly attributing what's already captured vs. what's still
  unbuilt. This is the pattern working as intended — a flagged decision that
  actually got respected.
- **The work-comparison-picker-redesign and -refinements plans themselves** —
  once the gap was identified, process visibly improved within the same
  session, before either of today's two SDLC changes existed. The redesign
  plan has an explicit "§14 Open questions for sign-off" (7 items) with a
  dated "STATUS: CONFIRMED 2026-08-04" line naming which were explicitly
  chosen by the user vs. accepted-as-recommended. The refinements plan goes
  further still: "§0 Resolved decisions" is a table naming exactly which of 5
  items were flagged for sign-off with rationale for each, headed "Status:
  CONFIRMED 2026-08-05. All 5 sign-off questions..." This is a real,
  observable escalation in rigor — WorkPicker (unconsulted) → USDS shapes
  (partially unconsulted, self-corrected) → picker-redesign (7 explicit
  sign-off questions) → picker-refinements (5 sign-off questions with a
  dedicated resolved-decisions table) — that happened organically, before any
  new process file existed to require it.

### Are the two new process changes well-targeted?

**Consultation Check (mandatory ask after Implementation, before Review):**
well-targeted at both instances found here. Both WorkPicker and the USDS
shape/color set were exactly "Implementation just finished, decision was
made unilaterally, nobody asked before moving on" situations — precisely the
gap this stage exists to close. Had it existed on 2026-08-02 and 2026-08-04,
the mandatory-ask step would plausibly have caught both: the orchestrator
would have been forced to ask "run a Consultation Check?" right after
`f3bc95a`/`3c5dac3` (WorkPicker/WorkComparisonSection landed) and after
`412d622`/`59481e9`/`ad511ea` (the 10-slot scheme landed) — both natural
Implementation-complete boundaries. One gap worth naming: the check as
written triggers "after Implementation, before Review" for a *whole feature
cycle*. The USDS same-day correction happened after the feature had already
been *reviewed and shipped* — the check needs to have actually been run (not
just offered and declined) to catch a granular choice like "are these the
right 3 shapes," since Review itself isn't scoped to relitigate approved
design decisions. This isn't a flaw in the mandatory-ask rule itself, just a
reminder that asking-whether-to-run is necessary but not sufficient — running
it needs an honest "yes" often enough to matter, which is a judgment call
outside what a process doc can force.

**Deployment-count Retrospective trigger (3+ deployments since last
Retrospective):** this is the weaker fit, and arguably solves a different
problem than what happened here. Evidence: per the git state above, it's
plausible **zero** deployments happened in this entire 121-commit window
(nothing confirmed pushed past `e009915`, and no deploy-related commits
appear in the range at all — contrast with the prior retro's window, which
had explicit Render Blueprint/deploy commits). If that holds, a rule keyed
strictly on *deployment count* would never have fired here, no matter how
much consultation-worthy work piled up — because Deployment can stall for
reasons (no network) entirely unrelated to how much risky, UI-heavy work has
accumulated locally. The rule's implicit assumption — that deployments are a
reasonable proxy for "enough work has accumulated to be worth reviewing" —
breaks exactly in the scenario that most needs a check: a long stretch of
undeployed, unreviewed-for-consultation work. Suggested adjustment: broaden
the trigger to *also* count completed Implementation cycles / shipped plan
docs since the last Retrospective (not just successful deployments) — e.g.
"3+ deployments **or** 3+ completed feature plans since the last
Retrospective, whichever comes first" — so a deploy-blocked stretch doesn't
silently exempt itself from the cadence check that exists precisely to catch
what happened here.

### Memory-worthy (flagging, not saving)

- The escalating-rigor pattern above (WorkPicker → USDS → redesign →
  refinements) is itself a durable lesson worth a feedback-type memory
  update, distinct from the existing `feedback_ui_design_input.md`: not just
  "ask about UI components before Planning finishes," but specifically
  "aesthetic/visual *specifics* within an already-agreed *shape* (exact
  colors, exact marker shapes, exact spacing) need their own sign-off pass,
  separate from and in addition to sign-off on the higher-level
  component/pattern choice." The USDS incident shows the higher-level ask
  (cap, CVD requirement) doesn't automatically cover the granular one (which
  10 shapes).
- Consider updating `feedback_ui_design_input.md` itself (or adding a
  sibling memory) to note the redesign/refinements plans' "table of resolved
  decisions with rationale, explicitly flagged per-item for sign-off" format
  as the concrete shape that has actually worked for this user — it's more
  specific and reusable than "ask via AskUserQuestion," which the earlier
  memory already says but this session shows *how* to do well in practice.

## Coverage baseline check (CODE_STANDARDS.md, 85%)

**Backend: passes, 89.65% line coverage** (`bundle exec rspec`, 302 examples,
0 failures; SimpleCov's `"rails"` profile). The 11 files under 85% are almost
entirely unused Rails scaffold boilerplate never exercised by this app's real
logic (`base_mutation.rb`, `base_resolver.rb`, `base_enum.rb`,
`base_input_object.rb`, `base_scalar.rb`, `base_union.rb`, `application_job.rb`,
`application_mailer.rb`, `mutation_type.rb` — all 0–80%, all 1–24 relevant
lines). The two with real logic and lower coverage are `graphql_controller.rb`
(54.2%, 24 lines) and `backend_schema.rb` (71.4%, 14 lines) — worth a look if
backend coverage is revisited, but small and not urgent.

**Frontend: still cannot be verified as a true number — the multi-project
coverage attribution bug flagged at the last retro is unfixed, and the gap
has grown.** Confirmed directly: `frontend/vite.config.ts`'s `test.coverage`
block still doesn't exist at all (unchanged since the last retro). A live
`npx vitest run --coverage` run reports "94.41% statements" — but comparing
the printed file list against `find frontend/src -name '*.test.ts(x)'` (50
test files) shows at least **26 source files with real, passing test files
are missing from the report entirely**, including every file touched by this
session's biggest features: `colorTokens.ts`, `comparisonSelection.ts`,
`seriesStyles.ts`, `markerShapes.tsx`, `groupWorksByFandom.ts`,
`useWorkComparisonStore.ts`, `MultiSeriesTrendChart.tsx`,
`ComparisonLegend.tsx`, `DateRangeSlider.tsx`, `App.tsx`, `AppLayout.tsx`,
`LandingPage.tsx`, `TokenEntryForm.tsx`, `useTokenStore.ts`,
`useTokenFromUrl.ts`, `useStatsForUser.ts`, `tokenStorage.ts`,
`tokenSuggestion.ts`, `wordlist.ts`, `ingestClient.ts`,
`tokenUpdateClient.ts`, `workDetailIngestClient.ts`,
`buildIngestPayload.ts`, `buildWorkDetailPayload.ts`, `fanOut.ts`. This is
the same "94% is real for the subset it covers, not the true whole-project
number" problem from the last retro, just wider now because so much new code
landed in exactly the files the tool doesn't attribute. **This needs to stop
being deferred** — it's now been flagged at two consecutive retros without a
fix landing, despite `TECH_DEBT.md` recording an attempted fix ("tried
`coverage.all: true` plus explicit include/exclude... no effect"). Given the
likely cause (Vitest's multi-project config not merging v8 coverage across
the jsdom + Storybook/browser projects) is a known category of Vitest issue,
this is worth dedicated Maintenance time rather than another "flag and defer"
cycle — every retro that re-flags it without resolution makes the 85%
baseline check meaningless for the frontend specifically.

## TECH_DEBT.md backlog health

606 lines now (was ~220 at the last retro), with 44 top-level bulleted
entries, 8 of them resolved-with-strikethrough in place per this project's
established convention (kept as history, not deleted). This is not an
unmanaged pile — the resolved entries show real closure (the two Copy-button
a11y items, the stale-comment fix, the CVD matrix verification), and several
open items are consciously-deferred, explicitly-signed-off residual risk
(the broadened curl/overwrite surface, token entropy) rather than forgotten
work. But the raw growth rate (nearly 3x in one cycle) is itself worth
naming: this session shipped nine feature plans without an intervening
Retrospective, so nothing forced a pass to consolidate, prioritize, or close
stale entries along the way — unlike `PRIORITIES.md`'s explicit tiering,
which the last retro credited with keeping the backlog navigable, there's no
equivalent tiering structure over these 44 entries. A few candidates worth
prioritizing given repetition/age here:
- The frontend coverage-attribution bug (2026-07-31 entry) — flagged twice
  now, see above.
- Two files over their `.ts` 400-line budget (`banners.test.ts` at 668 lines,
  `fanOut.test.ts` at 486 lines) — both logged as "flag for Review/
  Retrospective to decide," and this is that decision point: both are worth
  splitting by describe-block/scenario group next time either file is
  touched, rather than continuing to defer indefinitely.
- `WorkPicker.tsx` at 579 lines (over the 500-line `.tsx` budget) — same
  "flag for Review/Retrospective" shape, same recommendation to split
  (icon components and/or the bulk-select-bar pairing) next time it's
  touched.
- The render-phase Zustand store mutation in `WorkComparisonSection.tsx`
  (2026-08-05 entry) — currently harmless (only one subscriber, idempotent
  writes) but explicitly flagged as a landmine for the deferred
  bookmarks/comments-toggle metrics feature, which will add a second
  subscriber. Worth fixing (move to `useEffect`) before that feature starts,
  not after it breaks.

None of the above are urgent enough to block anything, but the backlog is
big enough now that the next Retrospective (or a dedicated Maintenance pass)
should treat "triage `TECH_DEBT.md`" as its own line item rather than
continuing to only add to it.

## What went well

- **The escalating-consultation-rigor pattern** documented above — real,
  visible process improvement within a single session, driven by the user's
  own mid-session feedback rather than by either of today's new process
  files (which postdate all of it). The redesign and refinements plans'
  explicit "table of decisions, each tagged for sign-off with rationale"
  format is a genuinely good, specific artifact — worth treating as the
  template, not just "remember to ask."
- **The deferred toggle-graph consultation held.** A plan explicitly flagged
  a UI as needing future consultation, and nothing built it prematurely
  across two more feature cycles — the flag-and-defer mechanism worked
  exactly as intended here, in contrast to the two instances where a
  decision wasn't flagged for consultation at all.
- **CVD/contrast verification methodology stayed rigorous even where the
  consultation gap existed.** The USDS scheme's actual numbers (WCAG
  contrast, Machado-2009 CVD matrices independently re-verified against the
  primary source in `TECH_DEBT.md`'s 2026-08-04 entry) were sound — the gap
  was specifically "didn't ask if the shapes look right," not "the
  accessibility math was wrong." Worth distinguishing: this cycle's
  consultation gaps were about aesthetic preference, not about correctness
  or rigor being skipped.

## What to change

1. **Extend the granular-sign-off habit to "specific visual values within an
   agreed shape," not just "which component/pattern."** See "Memory-worthy"
   above — this is the concrete, generalizable fix for the USDS gap
   specifically.
2. **Fix the frontend coverage-attribution bug for real this cycle**, not
   defer a third time — see Coverage section above.
3. **Adjust the deployment-count Retrospective trigger** to also fire on
   completed-feature-plan count, not just deployment count, so a
   network-blocked deploy doesn't quietly suppress the cadence check — see
   "Are the two new process changes well-targeted" above.
4. **Confirm the real state of `origin/main`** next time there's network
   access, and treat this session's "shipped" features as "merged locally,
   pending deploy" until that's confirmed — see the caveat under "What
   shipped."
5. **Triage `TECH_DEBT.md`** as a discrete task (not just continued
   accumulation) — the four items named above are reasonable candidates to
   start with.

## Suggested file changes arising from this retro

Recommendations only, not applied:

1. `~/.claude/SDLC_PROCESS.md`'s "Starting a task" deployment-count check:
   broaden to "3+ deployments **or** 3+ completed feature plans since the
   last Retrospective."
2. `feedback_ui_design_input.md` (or a new sibling feedback memory): add the
   "granular visual specifics need their own sign-off, separate from the
   higher-level pattern" lesson, and note the redesign/refinements plans'
   per-item sign-off table format as the concrete template that's worked.
3. Project-local: prioritize the frontend Vitest multi-project coverage fix
   in the next Maintenance pass rather than re-flagging it a third time.

Not applied here since they touch global process files/memory beyond this
one project — flagged for the user's decision per this project's standing
convention.
