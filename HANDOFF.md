# AI0506 Calendar - Development Handoff

## Project summary

AI0506 Calendar is a private, single-user calendar for study, research, exams, projects, and daily life. It provides a Web calendar, a Cloudflare Pages Functions API, a Cloudflare D1 database, MCP access for AI clients, and an Android client in the same repository.

The Phase 1 core is implemented. The current checkout has passed its five Node test suites. This handoff was prepared on 2026-08-05. GitHub contains the shareable source and documentation; the accompanying local migration archive contains the intentionally ignored local configuration, local D1 state, and `production/` working material.

## Completed functionality

- Password/session authentication for the Web client and bearer-token access for app/agent clients.
- Event CRUD, categories, import/export, recurring event series, exceptions, split operations, and soft deletion.
- Deadlines with priority, completion/reopen, reminders, notifications, and notification-center behavior.
- Tags and category tag suggestions.
- MCP OAuth discovery/registration/authorization/token endpoints, read scope, and write attribution.
- Web calendar views and Android Kotlin/Compose client, including local reminders and offline cache.
- D1 schema migrations `0001` through `0011` and Node regression tests for deadlines, reminders, series patching, tags, and OAuth scopes.

## Outstanding work and known issues

- `BUGS.md` records one open issue: local Wrangler compatibility-date/version consistency. Verify the installed Wrangler version on the new computer before local development.
- Production acceptance remains incomplete: authenticated production Tag smoke test, browser Notification permission/system notification validation, and production Cloudflare API/D1 end-to-end validation.
- Android device acceptance remains incomplete for a physical phone and for manual layout/form/notification navigation checks across phone and large-screen devices.
- `MCP_DEPLOY.md` indicates the remote D1 migrations (including `0006` and `0011`) and a Pages deployment require a separately authorized Cloudflare operator. Do not assume that a local test or Git push deploys production.
- `production/` holds active design drafts, plans, screenshots, previews, and helper scripts. It is intentionally not version-controlled and may contain superseded alternatives; review it before treating it as final product documentation.
- No executable-source `TODO` or `FIXME` markers were found in the tracked application code during this handoff scan.

## Development environment

| Area | Current setup |
|---|---|
| Web/API language | JavaScript ES modules |
| Web framework/runtime | Cloudflare Pages + Pages Functions / Workers runtime |
| Database | Cloudflare D1 (`calendar-db`), SQLite-compatible |
| Package manager | npm with `package-lock.json` |
| Local runtime observed | Node.js `v24.16.0`, npm `11.13.0` |
| CLI dependency | Wrangler `^4.110.0` |
| Frontend assets | Static HTML/CSS/JavaScript under `public/` |
| Android client | Kotlin, Jetpack Compose, Gradle wrapper |
| Third-party platforms | GitHub, Cloudflare Pages, Cloudflare D1, MCP/OAuth clients |

Use a current Node.js release compatible with the lockfile dependencies (Node 24 was used for this handoff). Android Studio plus a suitable JDK/Android SDK are needed only for the Android app.

## Environment variables and private local files

Never copy real values into GitHub, documentation, or source code. Copy the included private files only into your own new local checkout.

| Name / file | Purpose |
|---|---|
| `PASSWORD` | Private Web login password, stored locally in `.dev.vars`. |
| `API_TOKEN` | Bearer token for the Android app and AI-agent API access, stored locally in `.dev.vars`. |
| `SESSION_SECRET` | Signs browser session cookies, stored locally in `.dev.vars`. |
| `MCP_WRITE_TOKEN` | Local-only MCP write/debug token, stored locally in `.dev.vars`. |
| `DB` | Cloudflare D1 binding supplied by Wrangler/Pages from `wrangler.toml`; do not set a secret value manually. |
| `.wrangler/state/v3/d1/` | Local Miniflare/D1 SQLite state, including test/local calendar data. |
| `android/keystore.properties` and signing-key file, if present | Optional private Android release-signing configuration; the archive preserves it if it exists. |

## New-computer migration procedure

1. Clone the repository and enter it:
   ```powershell
   git clone https://github.com/ai0506/calendar.git
   cd calendar
   git pull --ff-only
   ```
2. Confirm the clone includes the handoff commit. Download/pull any branch update first; do not overwrite newer Git files with an older archive copy.
3. Extract the local migration archive **over this clone**, preserving paths. It supplements Git with `.dev.vars`, local D1 files, `production/`, and any private Android signing files. Let the archive replace tracked files only when its recorded handoff commit is newer than the clone.
4. Install JavaScript dependencies exactly from the lockfile:
   ```powershell
   npm ci
   ```
5. Check `.dev.vars` exists and has the four variable names listed above. If it is intentionally not transferred, copy `.dev.vars.example` and supply private values yourself.
6. For an empty local D1 state only, run `npm run db:local`. If the archive supplied `.wrangler/state/v3/d1/`, preserve it first; running migrations is normally safe but is not a substitute for restoring its existing local data.
7. Start the full local Pages + Functions environment:
   ```powershell
   npx wrangler pages dev public --local --port 8788
   ```
8. Run the regression tests:
   ```powershell
   npm run test:deadlines
   npm run test:reminders
   npm run test:series-patch
   npm run test:tags
   npm run test:oauth-scopes
   ```
9. For Android, open `android/` in Android Studio, then use the commands in `android/README.md`. Restore any private release-signing files only if you need a signed release build.
10. Cloudflare login, remote migrations, and deployment are separate production actions. Use `DEPLOY_CHECKLIST.md` and `MCP_DEPLOY.md`; verify the target D1 database and Pages project before running any `--remote` or deploy command.

## Handoff verification performed

- `git fetch --all --prune` succeeded; before this handoff, the checkout was one commit ahead of `origin/main` and had one unstaged source edit.
- The five listed Node test commands passed on the current computer.
- Archive contents are verified separately in `FILE_TRANSFER_LIST.md`; it excludes Git metadata, `node_modules`, Android/Gradle build caches, generic caches, and logs while retaining the local D1 database files.
