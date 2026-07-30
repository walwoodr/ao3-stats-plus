# ao3-stats-plus

See @TECH_STACK.md for this project's tech stack. It extends the global
`~/.claude/TECH_STACK.md` (Ruby/Rails + GraphQL backend, React/TypeScript +
Vite frontend, per the global spec) with a small number of explicitly
approved exceptions - see that file for the full list and rationale. Per
the global `~/.claude/CLAUDE.md`, this project-level spec is the more
specific authority for ao3-stats-plus: check it before treating anything as
"out of stack" here.

No project-specific overrides exist yet for `SDLC_PROCESS.md` or
`CODE_STANDARDS.md` - the global versions in `~/.claude/` apply as-is.

## Design context

This project has a design-context snapshot at `design-system/ao3-stats-plus/MASTER.md`,
generated via the `ui-ux-pro-max` + `frontend-design` skills per the global SDLC's Design
stage/Planning-augmentation process (see `~/.claude/SDLC_PROCESS.md` and
`~/.claude/agents/sdlc-design.md`). Any new UI work in Planning must reference and stay
consistent with it; any UI-touching Maintenance fix must check against it before committing.
It is not yet applied to the existing frontend (`frontend/src/`) - the current implementation
still uses the plain Tailwind slate palette scaffolded during Bootstrap. Migrating the existing
UI to the new design tokens is a separate, not-yet-scoped task.
