# Plan: Render hosting/deployment (split topology)

Status: **shipped and live** (deployed 2026-07-31). This document is a
**retroactive reconstruction**, written 2026-07-31 during Retrospective —
Planning for this thread never produced a committed `docs/plans/*.md`
artifact the way this project normally does (see the retro finding below),
so this captures what was actually decided, reconstructed from git history
(`git log`/`git show` on the commits cited throughout), `render.yaml`,
`README.md`'s "Deployment (Render)" section, `PRIORITIES.md`, and
`TECH_DEBT.md`. Where this doc cites a task ID (T1–T5, I1–I7, R1–R8), that's
the original TaskList-based plan's numbering, preserved for continuity with
existing citations in `render_yaml_spec.rb` and `render.yaml`'s own header
comments.

## Why this doc exists now, not at Planning time

`docs/retros/2026-07-render-deploy-and-tier1-maintenance.md` (finding #4)
found that this project has a real, consistent `docs/plans/` convention —
see `docs/plans/bookmarklet-entrypoint-and-hosting.md` — but no equivalent
file was ever committed for the Render hosting decision, even though the
task-ID structure (T1–T5/I1–I7/R1–R8) shows a real plan existed. Two spec/
config files (`render_yaml_spec.rb`'s header, `render.yaml`'s own header)
cited `docs/plans/bookmarklet-entrypoint-and-hosting.md`'s "Section 1 / T5"
for this — but that file's actual Section 1 is the bookmarklet *entrypoint*
happy path, not Render hosting; it has no Render/Docker/Postgres/cost
content at all. Those citations were stale/mistaken and have been corrected
to point here instead.

## Happy path

1. Frontend and backend deploy as two separate Render services (a
   **split topology**, not a single combined deploy), each with its own
   origin.
2. A developer pushes to `main`; Render's Blueprint (`render.yaml` at the
   repo root) drives both services' builds and deploys automatically.
3. The backend runs `bundle exec rails db:migrate` as a `preDeployCommand`
   before each new deploy goes live, so schema changes ship with the code
   that needs them, with no manual migration step.
4. Render polls the backend's `/up` health check (Rails' built-in endpoint)
   before routing traffic to a new deploy.
5. The frontend is a static site build (`npm install && npm run build`,
   publishing `frontend/dist`) with SPA-rewrite routing (`/*` →
   `/index.html`) so client-side routes work on a hard refresh.

## Decisions confirmed

- **Split topology, not combined:** backend (`ao3-stats-plus-api`, Docker
  web service, Starter plan) and frontend (`ao3-stats-plus`, static site,
  free) are separate Render services with separate origins, plus a managed
  Postgres database (`ao3-stats-plus-db`, Basic 256mb plan). This mirrors
  the bookmarklet-entrypoint plan's existing split-origin CORS design
  (`/graphql` scoped to the frontend origin, `/ingest` scoped to AO3's
  origin) rather than introducing a new topology.
- **Docker runtime for the backend**, not Render's native Ruby buildpack —
  the project already has `backend/Dockerfile`; reusing it avoids
  maintaining two separate build definitions for the same app.
- **Static site under `services:` with `runtime: static`, not a top-level
  `staticSites:` key.** An earlier version of both `render.yaml` and
  `render_yaml_spec.rb` assumed `staticSites:` without verifying it against
  Render's live docs — Review caught that both shared the same wrong
  assumption (tests passed while being wrong against the real schema);
  fixed in `7ac39e3`. See `TECH_DEBT.md` for the resolved-with-history
  entry.
- **Cross-service wiring via hardcoded public URLs, not `fromService`:**
  Render Blueprints support a `fromService` env var reference, but it only
  exposes a service's *private*-network `host`/`port`, not its public
  `https://*.onrender.com` URL. Since the frontend needs the backend's
  public origin (to call `/graphql` and to know where the bookmarklet
  should POST) and vice versa (`FRONTEND_ORIGINS` for CORS), both services
  use fixed, predictable `name:` values instead, and each hardcodes the
  *other's* public origin as a plain `value:` in its own `envVars`
  (Render's public URL for a named service is always deterministically
  `https://<name>.onrender.com`). Tradeoff accepted explicitly: if either
  service is ever renamed, both `render.yaml` entries referencing its old
  URL need updating together — no automatic propagation.
- **`RAILS_MASTER_KEY` entered manually (`sync: false`), everything else
  automated.** `DATABASE_URL` is wired automatically via `fromDatabase`;
  `FRONTEND_ORIGINS`/`VITE_API_ORIGIN`/`VITE_GRAPHQL_URL` are plain
  hardcoded values per the wiring decision above. Only the Rails master key
  needs manual dashboard entry, using the value from the existing
  (gitignored) `backend/config/master.key`.
- **`diskSizeGB: 1` pinned explicitly**, not left to the platform default.
  See "Cost estimate" below — this was a post-launch fix (`8953a85`), not
  part of the original Implementation pass, added after a live cost
  surprise.

## Cost estimate

**Original estimate (Planning): ~$13/mo** — Starter web ($7) + Basic
Postgres compute ($6). This was correct for what it named, but it named
compute only; disk was never enumerated as a separate billable dimension.

**Actual first bill: $17.50/mo** — Render's Basic Postgres tier defaults to
a 15GB disk (~$4.50/mo at $0.30/GB) when `diskSizeGB` is left unset, which
showed up as a live surprise in the Blueprint UI rather than being
anticipated. Root-caused via the user checking Render's own dashboard cost
breakdown, then confirmed via Render's pricing docs.

**Fix (`8953a85`):** `diskSizeGB: 1` pinned explicitly (1GB is the platform
minimum; allowed values are 1 or multiples of 5). A personal single-user
stats tracker's actual data (a few thousand snapshot rows over years) needs
a few MB, not gigabytes — 1GB has enormous headroom. Render supports
resizing a disk up later if usage ever approaches it, but does not support
shrinking back down, so starting at the minimum rather than guessing high
is the safer default.

**Final actual cost: ~$13.30/mo** (Starter web $7 + Basic Postgres $6.30
compute+disk; the static site is free) — within a few cents of the original
estimate, once disk was accounted for correctly.

*Retro finding (see `docs/retros/2026-07-render-deploy-and-tier1-maintenance.md`,
finding #2): this gap is why Planning's required plan sections now include
an explicit infra-cost-estimate requirement (`sdlc-planning.md`) — enumerate
every billable dimension a platform's pricing page documents, or caveat
which ones weren't checked, rather than stating a single headline number.*

## Corner cases / error states

- **Health check failing on a bad deploy:** Render's `/up` poll gates
  traffic routing to a new deploy; a failing health check keeps the
  previous deploy live rather than routing to a broken one.
- **Missing `RAILS_MASTER_KEY` on first setup:** the backend can't decrypt
  `config/credentials.yml.enc` without it; this is why it's flagged
  `sync: false` rather than expected to be auto-generated — the user must
  supply it once, manually, in the Render dashboard.
- **Service rename:** breaks the hardcoded cross-service URL wiring (see
  "Decisions confirmed" above) until both `render.yaml` entries are updated
  together.
- **Disk exhaustion:** not expected at this app's actual scale (a personal
  tracker's data footprint), but `diskSizeGB` can be resized up later if it
  ever becomes a real constraint; shrinking back down isn't supported.

## Task list (original numbering, for citation continuity)

Preserved because `render_yaml_spec.rb` and `render.yaml`'s own header
comments cite these IDs directly:

- **T1–T5 (Testing, red):** `a673349` (production `DATABASE_URL` not
  shadowed by hardcoded `database.yml` keys), `7c008c7`/`b46925e` (extract
  `CorsFrontendOriginMatcher`, fold in `/graphql` production-origin CORS
  coverage), `21a36dc` (lock in production-origin correctness for
  `bookmarklet.js` builds), `81df284` (pin `render.yaml`'s expected shape
  ahead of authoring it).
- **I1–I7 (Implementation, green):** `2716b3a` (derive production database
  config from `DATABASE_URL` only, I1), CORS matcher extraction (I2),
  `05e7565` (author `render.yaml` Blueprint, I3/I7), `e88fdf8` (document
  production `VITE_API_ORIGIN`/`VITE_GRAPHQL_URL` values, I4), `8a3f13a`
  (resolve the `TODO(deployment)` in `cors.rb` now that hosting is decided,
  I5), `9379c74` (add the README "Deployment (Render)" section, I6).
- **R1–R8 (Review/live verification):** `7ac39e3` (fix the `staticSites:`
  schema bug), live `onrender.com` verification (health check, DB-backed
  GraphQL query, CORS both directions, SPA routing, bookmarklet build) —
  reported passing after the user completed Render's dashboard Blueprint
  flow.
- **Post-launch fix:** `8953a85` (`diskSizeGB: 1`, see "Cost estimate"
  above).

## Open question (not resolved by this thread)

How periodic AO3 stat fetches get triggered is still undecided — the
approved tech stack has no background-job framework, but the product
concept needs a recurring fetch per author. See README.md's "Open question
for Discovery/Planning." Out of scope for this hosting thread; needs its
own Discovery/Planning pass.
