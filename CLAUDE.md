# AI0506 Calendar — Project Instructions (CLAUDE.md)

## Update Logging

During ClaudeCode, after any changes, find `updates.md` under the project root directory (if it does not exist, create one) and add a new line in the format:

```
[ClaudeCode][YYMMDDHHMMSS] the updates
```

Use UTF-8 encoding. `YYMMDDHHMMSS` is the current timestamp (2-digit year, month, day, hour, minute, second). Write a real, specific description of what changed.

A PostToolUse hook auto-appends a generic `[ClaudeCode][...] file updated` line after every Write/Edit — these are a fallback only, not a substitute for real logging. Before ending a turn (or a coherent chunk of work), delete every generic `file updated` line that the hook appended during that turn/task and replace them with a single specific line summarizing the whole change (what changed, in which files, and why). Never leave generic lines in `updates.md` — they provide no value to future readers and should not accumulate. If a task naturally produces multiple distinct milestones, one specific line per milestone is fine; a wall of `file updated` lines is not.

When the user asks to check updates, read `updates.md` in the project root and summarize it.

## Project Docs (read before making changes)

- `PROJECT_SPEC.md` — project requirements & architecture
- `FRONTEND_SPEC.md` — frontend UI requirements (visual direction & interaction principles; reference prototype `ui-preview/design-a-c.html`)
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
- DO NOT speak any language other than Simplified Chinese or English for communication
