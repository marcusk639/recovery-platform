---
name: firebase-deploy
description: Full production deploy pipeline — builds CSR, SSR, and Cloud Functions then deploys to Firebase Hosting. Supports --functions-only and --hosting-only flags for partial deploys.
disable-model-invocation: true
---

# Firebase Deploy

## Full deploy (default)

1. Confirm with the user that they want to deploy to production (Firebase project: `phoenix-cleanhouse`).
2. Run `npm run build` — this executes CSR build + SSR build + Cloud Functions build in sequence.
3. If the build passes, run `firebase deploy`.
4. Report the hosting URL and functions deploy status from Firebase output.
5. If anything fails, show the error output and suggest which partial deploy flag to use for retry.

## Partial deploys

If the user passes `--functions-only`:

1. Run `npm run build:functions` (builds only Cloud Functions).
2. Run `firebase deploy --only functions`.

If the user passes `--hosting-only`:

1. Run `npm run build:ssr` to rebuild SSR bundle.
2. Run `npm run copy:hosting` to sync browser dist to public/.
3. Run `firebase deploy --only hosting`.

## Notes

- All build commands require `NODE_OPTIONS=--openssl-legacy-provider` (already embedded in npm scripts).
- The functions build copies `../dist` into `functions/dist/` before TypeScript compilation — don't interrupt it mid-run.
- Always run the full `npm run build` before a full `firebase deploy`; partial builds leave stale bundles.
