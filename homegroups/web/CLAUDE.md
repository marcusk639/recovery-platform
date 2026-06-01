# Web App

This directory contains the React web app for RecoveryConnect (Homegroups). Loaded by Claude Code automatically when working inside `web/`. See `../CLAUDE.md` for project-wide rules.

## Commands

```bash
npm start                             # Dev server on port 3000
npm run build                         # Production build (output: web/build/)
firebase deploy --only hosting        # Deploy to Firebase Hosting (run from repo root)
# No automated test suite — verify changes manually via npm start
```

## Architecture

- `src/pages/` — 20 React web pages organized by domain: auth, account, facility dashboard, marketing/landing
- `src/components/` — shared UI components
- `src/lib/` — `deepLinks.js` (exports `WEB_ORIGIN`)

## Domain Rules

### WEB_ORIGIN constant

`src/lib/deepLinks.js` exports `WEB_ORIGIN`. This constant and three related files must all change together when switching to a custom domain — see `../docs/LAUNCH_BLOCKERS.md` #5 for the full list.

### Facility Dashboard (web entry)

`src/pages/FacilityDashboardPage.js` is mounted at the `/facility-dashboard` route and is the alumni-engagement dashboard entry. Calls the same backend callables documented in `../functions/CLAUDE.md`.

## Web-Local Skills

`.claude/skills/run-recovery-connect-web/` provides a `run-recovery-connect-web` skill for launching the dev server and taking screenshots. Active automatically when Claude is working in `web/`.
