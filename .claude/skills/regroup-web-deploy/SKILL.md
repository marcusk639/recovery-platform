---
name: regroup-web-deploy
description: Production deploy for regroup/web — builds the browser + SSR bundles and the `web` functions codebase, then deploys Hosting and the `ssr` function. Supports --functions-only and --hosting-only for partial deploys.
disable-model-invocation: true
---

> **Unit:** `regroup/web/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup/web"` first.

# Regroup web deploy

`.firebaserc` defaults to `phoenix-cleanhouse`, so every command below deploys to **production**
unless `--project` is given. The backend functions (the `default` codebase in `regroup/functions`)
are never deployed from here.

## Full deploy (default)

1. Confirm with the user that they want to deploy to production (`phoenix-cleanhouse`).
2. Run `npm run build` — `build:ssr` (browser + server bundles, `ng build --prod` then
   `ng run sapp:server:production`), then `build:functions` (`tsc` in `functions/`, then
   `build:copy-to-functions` copies `dist/` into `functions/dist/`).
3. If the build passes, run `npm run deploy` (`firebase deploy --only hosting,functions:web:ssr`).
   The Hosting and functions predeploy run `scripts/verify-ssr-target.js`, which refuses the deploy
   when the bundle targets the wrong project or the two copies of `index.html` differ (`--identical`).
4. Report the hosting URL and the `ssr` deploy status from the Firebase output.
5. If anything fails, show the error output. Do not retry with a partial deploy to get around a
   predeploy refusal — fix the bundle instead.

`npm run build:deploy` runs steps 2 and 3 in one command.

## Partial deploys

`--functions-only`:

1. Run `npm run build` (the `ssr` function serves the copied bundle, so it must be fresh).
2. Run `firebase deploy --only functions:web:ssr`.

`--hosting-only`:

1. Run `npm run build` (the predeploy compares `dist/sapp/browser/index.html` with the copy in
   `functions/dist/`, so both must come from the same build).
2. Run `firebase deploy --only hosting`.
3. Warn the user that the deployed `ssr` function still renders its previous bundle until it is
   redeployed; prefer a full deploy.

## Notes

- `NODE_OPTIONS=--openssl-legacy-provider` is set inside the `build`/`build:ssr` npm scripts.
- The local `firebase-tools` is 8.2.0 (see `regroup/web/CLAUDE.md`, Gotchas); if it cannot deploy
  this package, use the global `firebase` CLI with the same `--only` targets.
- The `/connect/stripe-return` and `/connect/stripe-refresh` Hosting rewrites point at functions in
  the backend `default` codebase; deploying Hosting does not deploy those functions.
