# ao3-stats-plus

A longitudinal stats-tracking app for [Archive of Our Own](https://archiveofourown.org/)
(AO3) authors: it periodically fetches data from an author's own stats page
(`https://archiveofourown.org/users/{username}/stats`), persists it over
time, and renders time-based graphs so an author can see how their fic
stats (hits, kudos, comments, bookmarks, subscriptions, etc.) trend over
time. This repository currently contains only the project skeleton -
scraping/fetching logic, the stats data model, and the graphing UI are not
yet implemented; see `TECH_DEBT.md` and the open question below.

## Stack

- **Backend**: Ruby on Rails (API-only mode) + GraphQL, PostgreSQL, RSpec, RuboCop.
- **Frontend**: React + TypeScript, Vite, React Router, Zustand, TanStack Query
  - graphql-request, Tailwind CSS, Storybook, Vitest, Playwright, ESLint + Prettier.

See `/Users/walwoodr/.claude/TECH_STACK.md` (or your own project-level
`TECH_STACK.md` if one is later added) for the full, authoritative stack spec.

## Prerequisites

- Ruby 3.3.5 via [rvm](https://rvm.io/) (`rvm use 3.3.5`)
- Node 22.x and npm (installed via [Homebrew](https://brew.sh/): `brew install node@22`)
- PostgreSQL 16 (via Homebrew: `brew install postgresql@16`, then
  `brew services start postgresql@16`)

## Backend (Rails API + GraphQL)

```sh
cd backend
bundle install
bin/rails db:create
bin/rails server        # http://localhost:3000, GraphQL at POST /graphql
```

Run the test suite and linter:

```sh
bundle exec rspec
bin/rubocop
```

Secrets/config: this app uses Rails' built-in encrypted credentials rather
than a `.env` file. Run `bin/rails credentials:edit` to add secrets; the
underlying `config/master.key` is gitignored and never committed.

## Frontend (React + Vite)

```sh
cd frontend
npm install
cp .env.example .env.local   # set VITE_GRAPHQL_URL if the backend isn't on :3000
npm run dev                  # http://localhost:5173
```

Other useful commands:

```sh
npm run lint          # ESLint
npm run format:check  # Prettier
npm run test           # Vitest (unit)
npm run test:e2e       # Playwright (e2e; starts the dev server automatically)
npm run storybook      # Storybook dev server
npm run build           # production build
```

The frontend expects the backend GraphQL API to be reachable at the URL in
`VITE_GRAPHQL_URL` (defaults to `http://localhost:3000/graphql`).

The bookmarklet (`bookmarklet.js`, built from `src/bookmarklet/*.ts` as a
second Vite IIFE library target - see `vite.bookmarklet.config.ts` - and
served from the frontend's own origin at `/bookmarklet.js`) POSTs captured
stats to the Rails `/ingest` endpoint directly. Its target origin is baked
in at build time from `VITE_API_ORIGIN`, separately from `VITE_GRAPHQL_URL`,
since it talks to a REST endpoint rather than GraphQL. Unlike
`VITE_GRAPHQL_URL` (which has a code-level fallback in `graphqlClient.ts`),
`VITE_API_ORIGIN` has **no runtime default** - `.env.example`'s value only
takes effect once copied to `.env.local` (see the Quick Start above), and
`npm run build` now fails loudly (rather than silently baking in a broken
`undefined` origin) if it's unset in `.env.local`/`.env.production`/the
build environment. `npm run build` builds the SPA and then
`bookmarklet.js` together (chained via `build:bookmarklet`); `npm run
verify:bookmarklet-build` checks the build output's shape (self-contained
IIFE, no React) and is run as its own CI step after the build.

### Testing the bookmarklet against real AO3

Clicking the installed bookmarklet on the real `https://archiveofourown.org`
while your frontend is running locally (`http://localhost:5173`) will be
blocked by Chrome's **Local Network Access (LNA)** restriction (rolling out
in Chrome 141/142): a public HTTPS site is not allowed to silently load a
script from `localhost`/your local network over plain HTTP, and since the
target isn't a secure context, Chrome blocks the request outright rather
than offering a permission prompt. This is a browser security feature, not
an app bug - see `TECH_DEBT.md`.

**Use `vite preview`, not `vite dev`, for this.** `bookmarklet.js` is a
build artifact (produced by `npm run build`, via `build:bookmarklet`) that
only exists in `dist/`. The dev server (`npm run dev`, port 5173) serves the
source tree directly and does not serve `dist/` at all, so tunneling it
gets you a 404 for `/bookmarklet.js`. `npm run preview` (port 4173, after a
build) serves the actual `dist/` output and is what needs tunneling.

Cloudflare Tunnel (`cloudflared`) is the only tunnel provider currently
wired into the host allowlists below - see "Using a different tunnel
provider" if you need another one.

```sh
brew install cloudflared   # once
```

**Quick path (recommended) - two convenience scripts handle the fiddly
parts:**

1. `cd backend && bin/rails server` (leave running).
2. In `frontend/`: `npm run tunnel:backend`. This opens a Cloudflare Quick
   Tunnel to `:3000` and, once the tunnel's URL is up, automatically writes
   `VITE_API_ORIGIN`/`VITE_GRAPHQL_URL` into `.env.local` for you (creating
   it from `.env.example` first if it doesn't exist) - no hand-editing, and
   no risk of forgetting the `/graphql` suffix on one of the two. Leave it
   running.
3. In another terminal: `npm run build && npm run preview` (serves the real
   `dist/` build, with the bookmarklet baked against the tunnel origin from
   step 2, at `:4173`).
4. In a third terminal: `npm run tunnel:preview` - opens a second Cloudflare
   Quick Tunnel to `:4173` and prints its URL.
5. Visit `InstallPage` via that preview tunnel URL (not `localhost`), so the
   generated bookmarklet's loader points at the tunnel origin instead of
   `localhost:4173`, and install/click it from there.

You do **not** need to set `FRONTEND_ORIGINS` on the backend for this -
`backend/config/initializers/cors.rb`'s local-dev default already allows any
`https://*.trycloudflare.com` origin for `/graphql`, specifically so a fresh
tunnel (a new random subdomain every restart) works without hand-editing
that env var each time. This only matters if you override `FRONTEND_ORIGINS`
yourself (e.g. to test a specific fixed origin) or deploy - see the comment
at the top of `cors.rb`.

**Manual path**, if you'd rather run `cloudflared` yourself instead of via
the npm scripts above: `cloudflared tunnel --url http://localhost:3000` (or
`:4173` for the preview server) prints a random `https://*.trycloudflare.com`
URL for that port - no account/login needed for this quick-tunnel mode, see
[developers.cloudflare.com/cloudflare-one/.../quick-tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/).
You'll still need to copy the backend tunnel's URL into `.env.local`'s
`VITE_API_ORIGIN`/`VITE_GRAPHQL_URL` (append `/graphql` to the latter)
yourself before building.

Vite rejects requests whose `Host` header it doesn't recognize (this
applies to both `vite dev` and `vite preview`), so you'll otherwise hit
"Blocked request. This host is not allowed" once you load the site through
the tunnel. `vite.config.ts`'s `server.allowedHosts` already allows
`.trycloudflare.com`, which `preview` inherits unless overridden.

Rails has the same protection on the backend (`ActionDispatch::HostAuthorization`):
tunneling `:3000` will 403 with a "Blocked hosts" error until the tunnel's
host is allowed. `backend/config/environments/development.rb` already allows
`.trycloudflare.com` via `config.hosts`.

### Using a different tunnel provider

If `trycloudflare.com` gets blocked by your DNS resolver/network (this
happens - some resolvers blocklist dynamic tunnel domains as a phishing
precaution), any other tunnel provider (e.g.
[Tunnelmole](https://tunnelmole.com/docs/), `npx tunnelmole <port>`) can be
substituted, but its domain needs adding in three places first, since none
of the conveniences above are wired to it:

- `frontend/vite.config.ts`'s `server.allowedHosts`
- `backend/config/environments/development.rb`'s `config.hosts`
- `backend/config/initializers/cors.rb`'s `DEFAULT_FRONTEND_ORIGINS` (or
  just pass `FRONTEND_ORIGINS=https://<your-frontend-tunnel-url>` to
  `bin/rails server` for that one run, restarting the server after setting
  it - see the comment at the top of `cors.rb`)

`npm run tunnel:backend`/`npm run tunnel:preview` are Cloudflare-specific
(`scripts/tunnel-backend.mjs` shells out to `cloudflared` directly) - use
the manual path above with your provider's own tunnel command instead.

## Deployment (Render)

Hosted on [Render](https://render.com), fully managed, defined as
Infrastructure-as-Code in `render.yaml` (a Render Blueprint) at the repo
root. This is a personal/single-user tool - the setup below is deliberately
minimal and **not built for scale** (see the open scale-related items in
`TECH_DEBT.md`: the per-work N+1 query, no `/ingest` rate limiting/auth, and
the credential-less claim design - none of that has changed as part of this
deployment work).

### Split topology

Frontend and backend are two separate Render services with two separate
origins, not a single combined deploy:

- **Backend** - `ao3-stats-plus-api`, a Docker web service (Starter plan,
  $7/mo) built from `backend/Dockerfile`, at
  `https://ao3-stats-plus-api.onrender.com`.
- **Database** - `ao3-stats-plus-db`, managed Postgres (Basic 256mb plan,
  $6/mo).
- **Frontend** - `ao3-stats-plus`, a free Static Site built from
  `frontend/` (`npm install && npm run build`, publishing `frontend/dist`),
  at `https://ao3-stats-plus.onrender.com`.

**Total: ~$13/mo** (Starter web + Basic Postgres; the static site is free).

### Wiring the two services together

Render Blueprints support a `fromService` env var reference for wiring
services together automatically, but it only exposes a service's *private*-
network `host`/`port` - there's no built-in property for a service's public
`https://*.onrender.com` URL. Since the frontend needs the backend's public
origin (to call `/graphql` and to know where the bookmarklet should POST),
`fromService` can't wire this pair together.

Instead, both services use fixed, predictable `name:` values in
`render.yaml`, and each service's `envVars` hardcodes the *other* service's
public origin as a plain `value:` (Render's public URL for a named service
is always deterministically `https://<name>.onrender.com`):

- Backend's `FRONTEND_ORIGINS` → `https://ao3-stats-plus.onrender.com`
  (consumed by `backend/config/initializers/cors.rb` for `/graphql` CORS).
- Frontend's `VITE_API_ORIGIN` / `VITE_GRAPHQL_URL` → built against
  `https://ao3-stats-plus-api.onrender.com`.

If either service is ever renamed, both `render.yaml` entries referencing
its old hardcoded URL need updating together - there's no automatic
propagation.

### Required secrets

`RAILS_MASTER_KEY` is declared in `render.yaml` with `sync: false`, meaning
Render will **not** auto-generate or supply it - it must be entered manually
in the Render dashboard (Environment tab) the first time the backend service
is created, using the value from the existing (gitignored)
`backend/config/master.key`. Nothing else needs manual secret entry:
`DATABASE_URL` is wired automatically via `fromDatabase`, and
`FRONTEND_ORIGINS`/`VITE_API_ORIGIN`/`VITE_GRAPHQL_URL` are plain hardcoded
values as described above.

### Migrations on deploy

The backend service's `preDeployCommand` (`bundle exec rails db:migrate`)
runs automatically before each deploy goes live, so schema changes ship
alongside the code that needs them without a manual migration step.

### Health checks

The backend declares `healthCheckPath: /up` (Rails' built-in health check
endpoint), which Render polls to confirm a new deploy is healthy before
routing traffic to it.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs three jobs on push/PR to
`main`: backend (RuboCop + RSpec against a Postgres service container),
frontend lint+unit (ESLint, Prettier check, Vitest, production build), and
frontend e2e (Playwright, in its own job so it doesn't block the faster
checks).

## Open question for Discovery/Planning

**How periodic AO3 stat fetches get triggered is not yet decided.** The
approved tech stack has no background-job framework (Sidekiq / GoodJob /
Solid Queue / etc. are all explicitly out-of-stack without asking first),
but the product concept requires fetching each author's stats page on some
recurring schedule. This needs a decision from Discovery/Planning - options
include (non-exhaustively) an approved background-job gem, an external/OS
scheduler (cron, a hosting platform's scheduled-job feature, a scheduled
CI workflow) hitting a plain endpoint or rake task, or something else.
