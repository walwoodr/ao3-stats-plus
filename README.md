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
  + graphql-request, Tailwind CSS, Storybook, Vitest, Playwright, ESLint + Prettier.

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
build) serves the actual `dist/` output and is what needs tunneling:

1. Tunnel the backend first, so you have its public URL before building:
   `npx tunnelmole 3000`.
2. Set `VITE_API_ORIGIN` and `VITE_GRAPHQL_URL` in `.env.local` (not
   `.env.example` - see above) to that backend tunnel URL, since the API
   origin is baked into `bookmarklet.js` at build time.
3. `npm run build`, then `npm run preview`.
4. Tunnel the preview server: `npx tunnelmole 4173`.

(`npx tunnelmole <port>`, or `npm install -g tunnelmole` for a persistent
`tmole` command - see [tunnelmole.com/docs](https://tunnelmole.com/docs/))

Vite rejects requests whose `Host` header it doesn't recognize (this
applies to both `vite dev` and `vite preview`), so you'll otherwise hit
"Blocked request. This host is not allowed" once you load the site through
either tunnel. `vite.config.ts` already allows `.tunnelmole.net` via
`server.allowedHosts`, which `preview` inherits unless overridden - no
extra config needed for tunnelmole specifically, but a different tunnel
provider's domain would need adding there.

Then visit `InstallPage` via the `https://*.tunnelmole.net` URL from step 4
(not `localhost`) so the generated bookmarklet's loader points at the
tunnel origin instead of `localhost:4173`, and install/click it from there.

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
