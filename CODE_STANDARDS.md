# Code & Commit Standards (ao3-stats-plus)

This project follows the global default in `/Users/walwoodr/.claude/CODE_STANDARDS.md`.
This file does not repeat that spec - it only lists project-specific exceptions
that have been explicitly approved.

## Approved exceptions

### TECH_DEBT.md: exempt from max-file-length budgets

- **What**: the project-root `TECH_DEBT.md` backlog file is exempt from the
  global spec's max-file-length table (which has no entry for this file
  type - it's being added here as a standing exemption, the same way
  lockfiles/generated config are already exempt there).
- **Why**: this file is triaged periodically (most recently 2026-10-13,
  73 -> 53 entries; see git history for that triage commit) rather than kept
  under a line budget day-to-day. A hard length cap would either force
  disruptive mid-stream splits during unrelated Maintenance/Review work, or
  push entries to be truncated in ways that lose real debugging context.
  Periodic triage is the right discipline for this file, not a standing
  size limit.
- **Approved**: by the user, 2026-10-19, as an ongoing exemption (not a
  one-time waiver) - do not re-flag this file's length in future Review/
  Maintenance passes.
