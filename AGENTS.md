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

## Development Rules

- Long-term maintenance project: small, targeted changes; do not rewrite without reason; do not touch unrelated code; understand existing structure first; fix root causes.
- Never hardcode passwords / API keys; never commit `.env` / `.dev.vars`; do not casually change DB schema or API format.
- Prefer simple, maintainable, clear solutions. No over-engineering, no premature optimization, no unnecessary dependencies.
