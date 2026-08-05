# AI0506 Calendar - File Transfer List

Prepared 2026-08-05. The migration archive is a supplement to a fresh GitHub clone, not a replacement for Git history.

| File / directory | GitHub status | Included in archive | Notes |
|---|---|---:|---|
| `functions/` | Committed (plus handoff source edit) | Yes | Pages Functions API and MCP source. |
| `public/` | Committed | Yes | Static Web application assets. |
| `migrations/` | Committed | Yes | D1 schema migrations, including `0011_mcp_attribution.sql`. |
| `tests/` | Committed | Yes | Node regression test suites. |
| `android/` source, Gradle wrapper, resources | Committed | Yes | Android client source and required Gradle wrapper/resources. |
| Root documentation and config (`*.md`, `package*.json`, `wrangler.toml`, `.dev.vars.example`) | Committed | Yes | Project specification, API/deployment docs, lockfile, and non-secret configuration. |
| `HANDOFF.md` | Committed by this handoff | Yes | New-computer setup and current-state guide. |
| `FILE_TRANSFER_LIST.md` | Committed by this handoff | Yes | This transfer classification. |
| `updates.md` | Committed | Yes | Agent change history; appended for this handoff. |
| `.dev.vars` | Local-only, Git-ignored | Yes | Contains private development credentials; never commit. |
| `.wrangler/state/v3/d1/` | Local-only, Git-ignored | Yes | Local Miniflare/D1 SQLite data and its WAL/SHM sidecars. |
| `production/` | Local-only, Git-ignored | Yes, except `*.log` | Working plans, design references, screenshots, previews, and helper scripts. It is intentionally outside Git. |
| `android/keystore.properties` and private signing key, if present | Local-only, Git-ignored | Yes | Private Android release-signing material. Keep private. |
| `.git/` | Local Git metadata | No | A fresh clone provides repository history and remotes. |
| `node_modules/` | Generated, Git-ignored | No | Recreate exactly with `npm ci`. |
| `android/.gradle/`, `android/.kotlin/`, `android/app/build/` | Generated caches/build output | No | Recreate with Gradle/Android Studio. |
| `.wrangler/state/v3/cache/` | Generated cache | No | Not needed to restore the local D1 data. |
| `dist/`, `build/`, generic cache folders | Generated output/cache | No | Rebuild from source. |
| `*.log` (including `production/mock_android_requests.log`) | Temporary logs | No | Useful only for past diagnostics; excluded to avoid stale/runtime-specific files. |
| `.idea/`, `.vscode/`, `.DS_Store`, `Thumbs.db` | Editor/system metadata | No | Machine-specific and regenerable. |

## Git classification at handoff

### A. Submitted to GitHub

- Existing local commit `ef6f7f5`: MCP `calendar.read` scope and per-write AI attribution, including migration `0011` and OAuth tests.
- Previously unstaged `functions/mcp/index.js` correction: removes an invalid output schema from the deadline-list MCP tool definition.
- `HANDOFF.md`, `FILE_TRANSFER_LIST.md`, and the corresponding `updates.md` log entry.

### B. Deliberately not submitted

The excluded generated directories, caches, logs, and machine/editor metadata in the table above. They are not source-of-truth and would make the repository larger or less reproducible.

### C. Preserved locally without Git

`.dev.vars`, local D1 database state, `production/`, and any Android private signing material. These are included in the private archive because they may be required to recreate the current local development state.
