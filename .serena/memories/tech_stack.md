# Tech stack (cross-package)

- Node 22 in CI (`.github/workflows/ci.yml`); npm with committed `package-lock.json` per package (no workspaces).
- TypeScript everywhere; Jest for unit tests; Firebase emulators for rules/integration suites.
- Mobile apps: React Native (bare CLI, no Expo), Firebase via `@react-native-firebase/*`, Stripe via `@stripe/stripe-react-native`, Sentry via `@sentry/react-native`, Maestro for e2e (Detox retired).
- CI Android builds use JDK 17 (`regroup-android-build` and `homegroups-maestro-smoke`: `npm ci` then `./gradlew assembleDebug`). The regroup job runs no Maestro flow (it drove a production-config APK; removed 2026-11-06); the homegroups Maestro step is `continue-on-error`, so it gates only the build. No iOS CI.
- Functions: Firebase Functions v2. firebase-functions ^7 in `homegroups/functions` and `regroup/functions`; ^6 in `recovery-api` (don't use v7-only APIs there).
- Regroup mobile specifics (versions, native pins, patches): `mem:regroup/mobile/core`.
