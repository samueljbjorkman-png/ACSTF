# ACS Athlete Development

Separate Codex/GitHub build of the ACS training tracker. The original hosted app is unchanged.

## Develop

Use Node 24 (tested with 24.19.0; see `.nvmrc`). No third-party runtime dependencies or install step are needed.

```sh
cd /workspace/ACSTF/acs-athlete-development
npm test
npm start
```

The development server listens on `127.0.0.1:4173`. On first local startup, create the initial coach account on the sign-in screen. Alternatively run `npm run create-coach` in a terminal; it prompts for an email and a hidden password. Do not put passwords in source files or commands. No default or example accounts are created.

## Accounts and permissions

Coaches manage the team's athlete profiles, performance records, training plans, and accounts. Use **Create account** to add a coach or link an athlete account to an existing profile. Removing an account signs it out on all devices and keeps its athlete history. Coaches cannot remove their own account from that screen.

Athletes can view their linked profile, records, plans, and workout history, and log assigned sessions. They can also see team leaderboard summaries (names, best marks, ranks, and dates); other athletes’ full profiles and private notes remain restricted. Athletes cannot edit profiles, prescribe plans, alter results, create accounts, or access other athletes' data. These restrictions are enforced on the server, independently of the UI. New accounts get an initial password chosen by the coach and shared privately. Account holders can change it after signing in. Email verification, invitations, and forgotten-password recovery are not implemented yet.

Passwords use salted scrypt hashes. Seven-day sessions use opaque random tokens in HttpOnly, SameSite cookies; token hashes are stored in the database. Production cookies also require HTTPS. Mutation requests require the configured origin and JSON. Login attempts are limited in this server process. Private server/database files are excluded from static serving.

## KPI and training leaderboards

The **Leaderboards** page shows separate girls’ and boys’ top 10 lists for vertical jumps, the standing broad jump, sprint tests, reactive strength index, step-up power, clean, and bench press. Choose a metric from the selector. Each athlete appears once, using their all-time best recorded performance. Higher values win for jumps, strength, and power; lower times win for sprints. Ties share a competition rank (1, 1, 3); equal marks are ordered by name, then athlete ID, with at most 10 athletes per list. Body weight and track event results are excluded.

New athlete intake requires sex: female (girls) or male (boys). Coaches can use **Set sex** on an existing athlete’s roster card to record or correct it, or leave it unrecorded when unknown. Existing profiles remain intact without automatic guesses; profiles without sex recorded do not enter either leaderboard. Rankings update from the shared performance records when the page opens or shared data is refreshed. No raw workout load is treated as a performance record automatically.

## Shared persistence

The server stores accounts, sessions, and team data in `data/acs.sqlite` using SQLite with WAL. This directory is ignored by Git. All browsers connected to the same running server share that database. Data persists after restarting the server. **Refresh shared data** retrieves changes from another session; automatic live updates are not implemented. Revision checks reject stale coach saves rather than silently overwriting another device's changes. Workout logging is checked against the server's assigned plan and cannot be repeated for a completed plan.

This implementation supports one team and one server with a persistent disk. It is not a deployed cloud service or a multi-instance database. Do not store the database on ephemeral hosting storage. To back up the complete database (including accounts), stop the server cleanly and copy the data directory to protected storage before restarting. Restore only while stopped. A JSON export is a records backup, not a complete account/database backup.

## Existing prototype data

Existing local browser data is not erased. A coach can choose **Copy old local data** to migrate the prototype's athlete profiles and history into an empty team database, if the old data exists at the same browser origin. Nothing is imported automatically. If the old app uses another address, export its JSON backup first. Historical CSV/JSON import still validates athlete IDs, skips duplicates, and merges records/workouts without overwriting. It requires the corresponding athlete profiles to exist first; importing an exported file does not recreate the old profiles or accounts.

## Hosting configuration

Before deployment, select hosting with HTTPS and a persistent disk, and establish backups and account recovery. Bootstrap registration is disabled in production; provision the first coach using `npm run create-coach` on the server against its persistent database. Start with:

- `NODE_ENV=production`
- `APP_ORIGIN=https://your-real-app-domain` (exact browser origin)
- `ACS_DB_PATH=/your/persistent/disk/acs.sqlite`
- `HOST=0.0.0.0` and `PORT` as required by the host

Put an HTTPS reverse proxy in front of the server. Production startup refuses to run without an HTTPS `APP_ORIGIN`. Use one Node process per database, and share the same database path with the provisioning command. No deployment or replacement of the original app has been performed.

## Validation

`npm test` runs programming-rule tests and API integration tests covering authentication, athlete isolation, forbidden writes, cross-origin rejection, stale saves, workout logging, password changes/session revocation, restart persistence, rate limits, private-file protection, leaderboard ranking/ties/top-10 limits, sex validation, and restricted leaderboard summaries. Browser smoke validation also exercised initial setup, athlete/profile creation, plan assignment, account creation, athlete sign-in, restricted controls, logging, a second session seeing the saved log, and reload persistence.

The A/C/B cycle, level-aware load rules, deload handling, and jump units are retained. Exact training prescriptions and championship peaking rules still require coach input; no missing historical records are invented.
