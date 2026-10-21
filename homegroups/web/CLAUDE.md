# Web App

This directory contains the React web app for Homegroups. Loaded by Claude Code automatically when working inside `web/`. See `../CLAUDE.md` for project-wide rules.

## Commands

```bash
npm start                             # Dev server on port 3000
npm run build                         # Production build (output: web/build/)
firebase deploy --only hosting        # Deploy to Firebase Hosting (run from repo root)
npm test                              # react-scripts test (CI: CI=true npm test -- --watchAll=false)
```

## Architecture

- `src/pages/` — 21 page components (+ `__tests__/`) organized by domain: auth, account, facility dashboard, marketing/landing
- `src/components/` — shared UI components
- `src/lib/` — `deepLinks.js` (exports `WEB_ORIGIN`, hardcoded `https://recovery-connect-cad4b.web.app`), `firebase.js`

## Domain Rules

### WEB_ORIGIN constant

`src/lib/deepLinks.js` exports `WEB_ORIGIN`. It and the other origin files (9 in all) must change together when switching to a custom domain — see `../docs/go-to-market/project-management.md` HG-P1-2 for the full list.

### Facility Dashboard (web entry)

`src/pages/FacilityDashboardPage.js` is mounted at the `/facility-dashboard` route and is the alumni-engagement dashboard entry. Calls the same backend callables documented in `../functions/CLAUDE.md`.

## Skills

Use the root skill `homegroups-run-web` to launch the dev server and take screenshots.
