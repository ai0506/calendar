# AI0506 Calendar — Project Instructions (AGENTS.md)

## Update Logging

During Codex, after any changes, find `updates.md` under the project root directory (if it does not exist, create one) and add a new line in the format:

```
[Codex][YYMMDDHHMMSS] the updates
```

Use UTF-8 encoding. `YYMMDDHHMMSS` is the current timestamp (2-digit year, month, day, hour, minute, second). Write a real, specific description of what changed.

When the user asks to check updates, read `updates.md` in the project root and summarize it.

## Project Docs (read before making changes)

- `PROJECT_SPEC.md` — project requirements & architecture
- `API_DOC.md` — API reference
- `BUGS.md` — known issues
- `CHANGELOG.md` — released version changes
- `TEST_CHECKLIST.md` — test items
- `updates.md` — AI agent change log

## `production/` Folder

`production/` holds in-progress production material that isn't finished project documentation yet — planning drafts, multi-option proposals awaiting a decision, and other temporary working files (e.g. `RECURRING_EVENTS_PLAN.md`, `RECURRING_EVENTS_IMPLEMENTATION_PLAN.md`, `FRONTEND_SPEC.md`, `ui-preview/`). Files here may be superseded, merged, or deleted once a decision is finalized and folded into the top-level docs.

This folder is listed in `.gitignore` and has no git history. Never use `git diff` / `git log` / `git status` to check whether files under `production/` changed — git cannot see it. Always re-read the file directly from disk to get its current content.

## Development Rules

- Long-term maintenance project: small, targeted changes; do not rewrite without reason; do not touch unrelated code; understand existing structure first; fix root causes.
- Never hardcode passwords / API keys; never commit `.env` / `.dev.vars`; do not casually change DB schema or API format.
- Prefer simple, maintainable, clear solutions. No over-engineering, no premature optimization, no unnecessary dependencies.
