# Staging operator for manual testing: design

> **Date:** 2026-11-09
> **Status:** draft, for owner review
> **Package:** `regroup/e2e`

## Why

The owner needs a Regroup operator account to sign into on a phone for manual testing, starting with the PR #160 device pass (React Native 0.88). The old test account was deleted. In production (`phoenix-cleanhouse`), a new operator can't create a house without an active subscription: `assertCanCreateHouses` in `regroup/functions/src/houses/createHousesTx.ts` needs `subscriptionMetadata` with a `tier` and an `active` or `trialing` status. Getting that in production means live Stripe.

Staging (`regroup-e2e`) can do it for real with no money involved. Checked on 2026-11-09:

- staging's `STRIPE_SECRET_KEY` is a test key;
- `createOperatorSubscription` there has `TIER_BILLING_ENABLED=true` and all 12 `STRIPE_PRICE_*` settings;
- the `E2EStaging` iOS build (`com.rats.dev.e2e.stg`) points at `regroup-e2e` and is registered there as an iOS app.

## What it does

One command, run by hand, makes a new operator on staging and subscribes them through Stripe for real, with a test card. Signing up and paying are both exercised. It then prints the email and password for signing in on the `E2EStaging` build.

The owner creates the house and invites residents in the app. The command doesn't.

## Goals

- **Real signup, following the web flow:** operators sign up and pay on the web. Mobile has none: picking the operator role in the app (`SignUp.tsx`, `superAdmin`) opens the web pricing page. So the command follows the web's `subscribeOperator` (`regroup/web/src/app/services/auth/auth-service.service.ts`):
  1. Create the account through staging's real Firebase Auth.
  2. Write the `users/{uid}` document shaped like `createSuperAdmin` (`regroup/web/src/app/entities/User`), through the security rules as that user.
  3. Call `createOperatorSubscription`.

  On the `E2EStaging` build, sign-in should go straight to Setup → OrgSetup, with no plan-required panel. _(Claude's call, after the builder check found that mobile has no operator signup and that sign-in never opens NewAccount.)_

- **Real subscription:** call staging's deployed `createOperatorSubscription` as that user, with a Stripe test payment method. The result is a real test-mode customer and subscription on a 7-day trial.
- **Owner picks the plan on each run:**
  - house type: `traditional` | `oxford`;
  - tier: the tiers for that house type in `regroup/functions/src/config.ts` `SUBSCRIPTION_TIERS` that are for sale (Oxford `network` is `availableForSale: false`, so it's refused);
  - interval: `month` | `year`.

  An invalid choice is refused before anything is created, and the error lists the valid choices.

- **Proof it worked:** read the user document back and confirm it passes the same rule the server applies (a tier plus `active` or `trialing`). The command fails loudly if it doesn't.
- **Usable output:** print the email, the password, the uid, the chosen plan, the Stripe customer and subscription ids, and one line on which app build to sign into.
- **No collisions:** every run makes a fresh account with a unique email, so old accounts are never reused or overwritten.

## Non-goals

- Creating houses, residents, invitations or any other data beyond the account and its subscription.
- Running in CI. It's a manual command, like PR #214's server suites.
- Production. There is no flag or setting that points it anywhere except `regroup-e2e`.
- Cleanup: cancelling the subscription or deleting old accounts. Staging is test mode, so old accounts cost nothing.
- Cards that need 3DS. `assertPaymentMethodUsable` refuses them by design, and the device pass checks 3DS in the app.

## Anti-goals (failures even if it works)

- Anything that can touch production Firebase or a live Stripe key.
- Writing `subscriptionMetadata` directly, the way PR #214's `seedOperator` does. That would skip the payment path, which is the point of this command.
- A password or key committed to the repo, or printed anywhere except the run's own output.

## Constraints

- **Target is fixed to `regroup-e2e`.** Refuse any other project id, wherever it comes from (env, config, flags).
- **Stripe stays test-mode.** The command holds no Stripe secret: staging's functions do the Stripe calls. If the builder adds a pre-check against Stripe (for example, confirming the customer exists in the e2e sandbox), it must reuse `assertTestKey` and `assertSandboxAccount` from `regroup/e2e/src/stripeSandbox.ts` and accept only `E2E_SANDBOX_ACCOUNT_ID`.
- **Sign-in doesn't need a verified email.** The app treats every account as verified (`regroup/mobile/src/services/users.tsx`), so made-up addresses are fine.
- **Staging config isn't in the repo.** The staging `GoogleService-Info.plist` is gitignored and copied in at build time from `~/.config/regroup-e2e/`. That folder also holds `firebase-web-config.json`, which is where to read staging's API key and project settings. If it's missing, refuse with a pointer to that folder.
- **Known side effect:** each subscription makes staging's functions send a "new subscription" email to admin@regroup-app.com. The command can't stop it, and it should say so in its output.
- **Never log PII.** Fake addresses only. The printed credentials are the command's purpose and go only to the terminal.
- **Repo norms:**
  - Node 22 and TypeScript, matching `regroup/e2e`.
  - Unit tests for the pure parts (argument parsing, plan validation, the project guard, the entitlement check).
  - Commit scope `regroup-e2e`.
  - New files under 300 lines.

## Left to the builder

- **Command name and argument style:** for example, `npm run e2e:staging-operator -- --house-type traditional --tier professional --interval month`.
- **How to reach staging:** the Auth REST API and the callable's HTTPS endpoint with the user's ID token, or a client SDK. The callables have no App Check.
- **The payment method:** a Stripe test token such as `pm_card_visa`, if `assertPaymentMethodUsable`'s SetupIntent accepts it server-side; otherwise whatever test-mode method it does accept.
- **Email and password:** the email format (for example `operator-<timestamp>@rats-e2e.com`) and how the password is made (random per run, or `E2E_TEST_PASSWORD` if set).
- **Relationship to PR #214:** whether to reuse anything from it once merged. Nothing here depends on it: #214 works on emulators with seeded data, and this works on staging through the real calls.
- **Docs:** where the one-paragraph "how to run it" goes, either `regroup/mobile/maestro/README.md` or the `regroup/e2e` README if one exists.
