# Regroup: environment variables and secrets

How to set, change and check every environment variable and secret Regroup uses: Cloud Functions, the mobile app, the operator portal, the website, and the test harnesses. Checked against the code on 2026-11-25 (`origin/main` 430b4ee8). Other products in this monorepo have their own setup; this page covers `regroup/` only.

For the one-time production billing setup (which values, in which order, webhook endpoints) see [`../launch-readiness/billing-go-live-runbook.md`](../launch-readiness/billing-go-live-runbook.md). This page is the general reference that runbook relies on.

## The rules

1. **A secret never goes in git or in any `.env` file that ships.** A secret is anything that grants access or signs: Stripe secret and restricted keys (`sk_`, `rk_`), webhook signing secrets (`whsec_`), the SendGrid key, the recovery-api service key, server-side Google keys, and `service-key.json`. Production secrets live in Firebase Secret Manager only.
2. **Production deploy config has one source: `regroup/scripts/stripe-prices.env`** (committed, reviewed). `npm run env:write` copies it into the gitignored `functions/.env.phoenix-cleanhouse`. Change the committed file in a PR, then re-run `env:write`. Never hand-edit `functions/.env.phoenix-cleanhouse`.
3. **Don't keep a `functions/.env`.** Firebase deploys it for every project, and any key missing from `.env.<project>` silently falls back to it (see [Load order](#load-order-and-why-functionsenv-is-dangerous)).
4. **Anything bundled into an app or web page is public.** Mobile bundles, the portal and the website ship to devices and browsers, where anyone can read them. Only publishable keys, public URLs and Firebase client identifiers belong there.
5. **Live and test values never mix.** Production functions bind live price ids and live keys (`stripe:verify-live` proves it). Store builds bundle `pk_live_`. E2E builds and emulators use test or sandbox values only, and their guards refuse live keys.
6. **Never paste a secret value** into a chat, PR, issue, commit message, log line or screenshot. To show what a file holds, show its key names: `grep -oE '^[A-Z0-9_]+=' <file>`. The repo is public.

## Which kind is it?

| Kind           | Examples                                                                          | Where it lives                                                                     | Visible to                   |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| Secret         | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENDGRID_API_KEY`                  | Firebase Secret Manager (production); `functions/.secret.local` (emulators)        | The functions that bind it   |
| Deploy config  | price ids, `CONNECT_BASE_URL`, `TIER_BILLING_ENABLED`, rent fee rates             | `scripts/stripe-prices.env`, written to `functions/.env.phoenix-cleanhouse`        | Anyone who can read the repo |
| Client-public  | `STRIPE_PUBLISHABLE_KEY`, `RATS_WEB_URL`, Firebase web/app config, the Sentry DSN | Mobile `.env` or build shell; committed Angular `environment*.ts`; Firebase config | Anyone holding the app       |
| Runtime switch | `config/sales.open`, `config/rentCharges.paused`, `paywall/config.enabled`        | Firestore documents, set with `npm run switch:set` (dry run first)                 | Server; never an env var     |

If you can't tell whether a value is a secret, treat it as one.

## Cloud Functions (`regroup/functions`)

### Load order, and why `functions/.env` is dangerous

Firebase reads these files from `regroup/functions/` (all gitignored except `.env.example`):

| File                         | Deployed?                 | Used for                                                                                   |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `.env`                       | Yes, to **every** project | Nothing. Delete it; see below                                                              |
| `.env.<projectId>`           | Yes, to that project      | Production: `.env.phoenix-cleanhouse`, written by `env:write`. Staging: `.env.regroup-e2e` |
| `.env.local`                 | No (emulator only)        | Local emulator config; wins over the others in the emulator                                |
| `.secret.local`              | No (emulator only)        | Emulator values for `defineSecret` secrets (sandbox keys only)                             |
| `.env.demo-regroup-payments` | No (demo project)         | Written by the payment suite's setup (`e2e/scripts/run-payment-suite.sh`)                  |
| `.env.example`               | No (template)             | Documents every key. Not loaded by anything                                                |

Precedence is **per key**: `.env.<projectId>` overrides `.env` only for the keys it sets. A key it omits comes from `.env`. On 2026-11-25 this put another Stripe account's legacy `STRIPE_HOUSE_PRICE_ID`/`STRIPE_OXFORD_PRICE_ID` into production config: `stripe-prices.env` deliberately omits them, so they fell through to a stale generic `.env`. That same `.env` also held superseded annual price ids, which a production deploy would have used for as long as `.env.phoenix-cleanhouse` lacked them. `scripts/preflight-billing.js` reads the same merged set Firebase deploys, so it can't tell a value from `.env` apart from one in `.env.<projectId>`.

Don't use Firebase's reserved names, in `.env` files or as secret names: any key starting with `FIREBASE_`, `X_GOOGLE_` or `EXT_`, and runtime names such as `PORT`, `K_SERVICE` and `GCLOUD_PROJECT`. The full list is under "Reserved environment variables" in [Configure your environment](https://firebase.google.com/docs/functions/config-env#reserved-names).

### Changing production config (non-secret)

From `regroup/`:

1. **Edit `scripts/stripe-prices.env` in a PR.** Each value carries a comment saying where it comes from. A new Stripe price also gets a row in `scripts/stripe-product-values.md` and a line in the dated live-config log.
2. After it merges, from a clean checkout of `main`:
   ```bash
   npm --prefix functions ci
   npm --prefix functions run env:write -- --project phoenix-cleanhouse        # rewrites functions/.env.phoenix-cleanhouse wholesale
   npm --prefix functions run stripe:verify-live -- --project phoenix-cleanhouse # read-only: key is Regroup's account; every price live, active, USD, right amount and interval
   node scripts/preflight-billing.js                                              # also runs as functions.predeploy; --strict for a go-live check
   npm --prefix functions run build
   firebase deploy --only functions
   ```
3. **Confirm the runtime**, not just the file: Firebase Console → Functions → a function → Environment variables. The preflight checks the source files, not what's deployed.

`env:write` refuses unless every required key has a value (`REQUIRED_KEYS` in `functions/src/scripts/writeFunctionsEnv.ts`): the 12 tier price ids, `CONNECT_BASE_URL`, `STRIPE_API_VERSION`, `TIER_BILLING_ENABLED` and `RECOVERY_API_BASE_URL`. `STRIPE_API_VERSION` must equal the pin in `functions/src/util/stripeApiVersion.ts`, which the preflight checks.

**Adding a config key:**

- Read it through `process.env` in one place, with a clear error or a documented default when it's unset.
- Add it to `scripts/stripe-prices.env` with a comment.
- If the deploy must not ship without it, add it to `REQUIRED_KEYS` and to `CONFIG_REQUIRED` in `scripts/preflight-billing.js`.
- Document it in `functions/.env.example` as `[CONFIG]`, and add a test that pins the default or the refusal.

**Staging (`regroup-e2e`):** `env:write` refuses any project except production, so staging never gets production's values by accident. Write `functions/.env.regroup-e2e` by hand from the sandbox's own price ids and test-mode settings, and keep a copy outside the repo. The preflight refuses a deploy only when neither `functions/.env` nor `.env.<projectId>` exists, so a leftover `functions/.env` lets a staging deploy through without `.env.regroup-e2e`, carrying whatever that file holds. One more reason to delete it.

### Secrets (Firebase Secret Manager)

Nine secrets are defined with `defineSecret()` in `functions/src/config.ts`. Each function receives only the secrets listed in its own `secrets: [...]`.

| Secret                               | Value                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | Live secret or restricted key (`sk_live_`/`rk_live_`) of Regroup's account `acct_1GfryQKsstp3aqoP` |
| `STRIPE_WEBHOOK_SECRET`              | `whsec_` of the live `stripeEvents` endpoint                                                       |
| `STRIPE_CONNECT_WEBHOOK_SECRET`      | `whsec_` of the live `handleStripeConnectWebhook` (Connect) endpoint                               |
| `STRIPE_TEST_WEBHOOK_SECRET`         | `whsec_` of any test-mode endpoint aimed at the production URL (refused as wrong mode)             |
| `STRIPE_CONNECT_TEST_WEBHOOK_SECRET` | Same, for the Connect endpoint                                                                     |
| `STRIPE_CLIENT_ID`                   | Connect client id (`ca_`); bound on `disconnectStripeAccount`, never read                          |
| `SENDGRID_API_KEY`                   | SendGrid API key for transactional email                                                           |
| `GOOGLE_MAPS_API_KEY`                | Server key for the Geocoding and Time Zone APIs (`userIsAtMeeting`)                                |
| `RECOVERY_PLATFORM_API_KEY`          | Service key for recovery-api; must equal recovery-api's own `RECOVERY_PLATFORM_API_KEY`            |

**Set or change one:**

```bash
# from regroup/ (the .firebaserc default is phoenix-cleanhouse; name the project anyway)
firebase functions:secrets:set STRIPE_SECRET_KEY --project phoenix-cleanhouse        # prompts; the value never touches shell history
firebase functions:secrets:set STRIPE_SECRET_KEY --project phoenix-cleanhouse --data-file ./key.txt   # from a file; delete the file afterwards
```

- Use the prompt or `--data-file`. Don't use `echo sk_live_… | firebase …`: that puts the value in shell history and process listings.
- **A function keeps the secret version it was deployed with.** After setting a new value, redeploy every function that binds it, or it keeps using the old one. For a webhook secret that means `stripeEvents` or `handleStripeConnectWebhook`.
- Inspect without printing: `firebase functions:secrets:get NAME --project phoenix-cleanhouse` lists versions and their state. `functions:secrets:access NAME` **prints the value**, so use it only when you must, and never in a recorded terminal or a chat.
- Clean up: the CLI destroys some unused versions itself when you deploy a new one. `firebase functions:secrets:prune --project phoenix-cleanhouse` removes secrets no deployed function references, and `functions:secrets:destroy NAME@<version>` removes one version. A deployed function whose secret was destroyed fails silently, so check the bindings first.

**Rotating a secret** (a leak, a staff change, or routine):

1. Create the new credential at the provider (Stripe: roll the key or the endpoint's signing secret; SendGrid: a new key).
2. `functions:secrets:set` the new value.
3. Redeploy the functions that bind it, then check that they work (a webhook delivery succeeds, a test email sends).
4. Revoke the old credential at the provider, then prune the old secret version.

For a leaked secret, do step 4 as soon as step 3 is green. Assume anything committed to this public repo was copied: rewriting git history doesn't un-leak it.

**Adding a secret:**

- `defineSecret("NAME")` in `functions/src/config.ts`, bound in `secrets: [...]` on exactly the functions that read it, read with `.value()` inside the handler (never at module load).
- Add it to the secret list in `scripts/preflight-billing.js` so the preflight checks it exists.
- Add it to `functions/.env.example`, commented out, as `[SECRET]`.
- Set it in **every** project before the first deploy that binds it, and put a sandbox value in `functions/.secret.local` for the emulators.
- Don't rely on `firebase deploy` to catch a missing secret: whether the pinned CLI fails or prompts is unverified.

### Emulators and test suites

- **Manual emulators:** config in `functions/.env.local` (it overrides `.env` and `.env.<projectId>` in the emulator), secrets in `functions/.secret.local`. Sandbox or test values only, never live.
- **List every bound secret in `.secret.local`.** For a secret it doesn't list, the Functions emulator reads the deployed project's real value from Secret Manager with your application default credentials. A local run signed in to `phoenix-cleanhouse` could then use production's live Stripe key.
- **A fresh worktree** has neither file. Copy `functions/.secret.local` in from your main checkout (`regroup/CLAUDE.md`), never the other way round.
- **Payment suite** (`cd e2e && npm run test:payments`): reads the sandbox key and webhook secrets from `functions/.secret.local` and writes its own `functions/.env.demo-regroup-payments`. It never touches the manual emulators' files.
- **Maestro emulator flows** (`scripts/test-prep.sh` at the repo root) use the `demo-regroup-e2e` project and the same `.secret.local`.

## Mobile app (`regroup/mobile`)

The JS bundle gets exactly the names in `BUNDLED_ENV` (`mobile/scripts/bundled-env.js`): `STRIPE_PUBLISHABLE_KEY`, `RATS_WEB_URL`, `GOOGLE_MAPS_API_KEY`, plus the build-set `E2E_VARIANT` and `E2E_BUNDLE_MARKER`. Babel inlines each one as a string literal at bundle time, so **every value ends up in the shipped app**. App code reads them through `src/config/env.ts`, never `process.env` directly.

**Where values come from**, highest priority first: the build shell's exported variables, then (iOS) `ios/.xcode.env.local`, then `mobile/.env` (gitignored, read by dotenv).

| Name                     | Development and e2e                          | Store build                                                                                                                                     |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (e2e bundles refuse `pk_live_`)  | `pk_live_…` (the release guard refuses anything else). Export it in the build shell rather than leaving it in `.env`, so e2e builds don't break |
| `RATS_WEB_URL`           | Optional; defaults to the production website | Optional                                                                                                                                        |
| `GOOGLE_MAPS_API_KEY`    | Optional                                     | Required (`check:env:release`). Restrict the key in Google Cloud to the app's bundle id and package name                                        |
| `E2E_VARIANT`            | Set per build by the e2e build types         | Must be unset. **Never put it in `.env`**: babel refuses                                                                                        |

- **Adding a name to `BUNDLED_ENV`** bakes its value into every build anyone can unzip. Only client-safe values qualify.
- **Checks:** `npm run check:env` (key present and `pk_`), and `npm run check:env:release` (adds `pk_live_` and the Maps key) before a store build. The release guard (`scripts/release-guard.js`) re-checks inside Android `release` and iOS Release/archive builds.
- **After changing a value:** Android bundle tasks re-bundle on their own (a digest of the bundled values is a Gradle input). Metro doesn't, so restart it with `npm start -- --reset-cache`.
- **Firebase app config** (`google-services.json`, `GoogleService-Info.plist`) holds public identifiers. The release guard requires production's (`phoenix-cleanhouse`) in store builds. The e2e staging variants copy theirs from `~/.config/regroup-e2e/` and fail without it.
- **Sentry DSN:** hardcoded in `src/config/sentry.ts`. A DSN is public by design.

## Operator portal (`regroup/portal`)

`tools/bundle.mjs` defines `process.env` as `{}` and sets only `NODE_ENV`, so no environment value reaches the portal bundle, including the mobile code it bundles. The bundle runs in browsers: never put a secret in portal source.

## Website (`regroup/web`, Angular)

- `src/environments/environment*.ts` are committed and hold Firebase web config and publishable keys. These are public identifiers; the pre-commit scan allowlists Firebase `AIza` keys only in client config.
- `src/environments/e2e-staging.generated.ts` is gitignored, generated by `npm run gen:e2e-staging` from the `regroup-e2e` web app config (template: `e2e-staging.generated.example.ts`).
- `web/functions/.env.<projectId>` files are committed on purpose: non-secret Firebase params for the SSR codebase (the one exception in the root `CLAUDE.md`). Secrets for those functions use `defineSecret`, as above.

## Keeping secrets out of git and out of deploys

- **Pre-commit** (`scripts/git-hooks/pre-commit`; install with `./scripts/install-git-hooks.sh`) blocks Stripe keys (including `whsec_`, `sk_test_`, `rk_live_`), Anthropic, OpenRouter, AWS and GitHub tokens, private keys, and `AIza` outside allowlisted Firebase client config. Never bypass it with `--no-verify`.
- **Deploy upload:** `regroup/firebase.json` `functions.ignore` keeps `*.local` (`.env.local`, `.secret.local`), `service-key.json`, `.claude/` and `coverage/` out of the function source upload. `.env` and `.env.<projectId>` are uploaded on purpose (`deployConfig.test.ts` pins both behaviors).
- **`functions/service-key.json`** (Admin SDK credentials for local scripts) is gitignored. Download it from the Firebase Console when needed, and delete it when done.
- **If a secret gets committed or pasted somewhere public:** rotate it first (above), then remove it from the file. Report it in the PR without repeating the value.

## Before a production functions deploy

- [ ] `functions/.env` doesn't exist (or holds nothing a production key could fall back to).
- [ ] `env:write -- --project phoenix-cleanhouse` ran from the commit you're deploying.
- [ ] `stripe:verify-live -- --project phoenix-cleanhouse` is green.
- [ ] Every secret the deploy binds exists in Secret Manager, with the preflight's secret check (or `--strict`) green.
- [ ] Built (`npm --prefix functions run build`) from a clean checkout. The predeploy hook doesn't build.
- [ ] After the deploy: the runtime environment variables match, and any rotated secret's functions were redeployed.

## Known gaps

- The preflight accepts `functions/.env` alone as deploy config: it blocks only when neither that nor `.env.<projectId>` exists (`loadDeployConfig` and the no-config check in `scripts/preflight-billing.js`). Requiring `.env.<projectId>` would close the fallback for every project; until then, the checklist's first item is the guard.
