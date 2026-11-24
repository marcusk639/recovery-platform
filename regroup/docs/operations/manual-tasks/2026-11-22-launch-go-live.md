# Regroup go-live: the manual steps

The owner's steps for the launch-readiness backlog in
`docs/launch-readiness/plan-regroup-recovery-api-2026-11-21.md` (B1–B8 and the manual MUST-FIX items).
The code items are in their own PRs. This document covers what only a person with console, store or
legal access can do, in the order it has to happen.

## Context

- **Production can't take a payment today.** Its functions are bound to `STRIPE_SECRET_KEY@3`, a key for
  the "Homegroups App" Stripe account, not Regroup's `acct_1GfryQKsstp3aqoP`. Version 7 (Regroup's key)
  exists since 2026-11-22, but only a redeploy binds it.
- **Production runs `main` as of 2026-11-11.** It lacks P4a billing (#254), #160, documents, Mark
  Resolved, the rules and indexes the new app needs, `CONNECT_BASE_URL` (without it Connect onboarding
  throws), and the web hosting `/connect` rewrites.
- **Live Stripe already done (2026-11-22):** six annual prices created, 12 duplicate monthly prices
  archived. See `docs/launch-readiness/stripe-live-config-log-2026-11-21.md`.
- **The deploy freeze** in `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md` holds until the
  owner lifts it. Nothing in Part C runs before that.

## Prerequisites

- **Merged to `main`:**
  - #285, deploy safety (functions `ignore` list, `env:write`, preflight refusal, `stripe:verify-live`).
    Until it merges, `env:write` and `stripe:verify-live` don't exist on `main`;
  - #286, invite links and the sign-up Privacy link (B5 code, B8 link). It overlaps P5 Tasks 3, 4
    and 6 (#281), which replace the `/redirect` email links with https app links. Merge one of the
    two, not both halves blindly;
  - the link-out checkout (B6): P5 Tasks 9–11 (#281), implemented on `feat/regroup-launch-p5`.
- **Tools:**
  - `firebase-tools` from npm (`npm i -g firebase-tools`), not Homebrew's;
  - `gcloud`, signed in as an owner of `phoenix-cleanhouse`;
  - the Stripe CLI, switched to Regroup live with `stripe switch acct_1GfryQKsstp3aqoP --live`.
- **A clean worktree at the merged `main`:**
  ```bash
  git -C ~/dev/recovery-platform fetch origin
  git -C ~/dev/recovery-platform worktree add ~/dev/rp-golive origin/main
  cd ~/dev/rp-golive/regroup
  ```

## Steps

### Part A — Now, before any deploy (minutes each)

#### A1. Remove the contact data from the public repository (M1)

**Where:** a branch off `main`.

`regroup/scripts/regroup_feedback_mailmerge.csv` (238 rows) and `regroup/scripts/test.csv` (17 rows)
hold email addresses and first names, and have been public since the first commit (`8e36c372`).

**Merge #291**, which removes both files and the mail-merge send logs in `regroup/scripts/logs/`
(they name the same recipients), and gitignores all three.

Then decide:

- **History:** removing the files leaves them in history. A rewrite (for example `git filter-repo --path
regroup/scripts/regroup_feedback_mailmerge.csv --path regroup/scripts/test.csv --path regroup/scripts/logs --invert-paths`) needs
  a force-push of `main` and every open branch rebuilt. GitHub keeps cached views until GitHub Support
  purges them.
- **Notice:** whether the people listed need telling.

**Expected result:** none of those files is on `main`.

#### A2. Rotate the key in the local commit `e0d94a63` (M2)

`e0d94a63`, on the local-only branch `feat/regroup-tier-billing`, adds `recovery-api/scripts/service-key.json`.

1. Confirm it was never pushed: `git branch -r --contains e0d94a63` should print nothing. (It printed
   nothing on 2026-11-24. Rotate anyway: the file sat in a local clone.)
2. Find the key's id: `git show e0d94a63:recovery-api/scripts/service-key.json | grep private_key_id`.
   That prints only the id, not the key.
3. Console → IAM & Admin → Service accounts (project `recovery-platform-e6cb3`) → that account → Keys →
   delete the key with that id.
4. Delete the branch: `git branch -D feat/regroup-tier-billing`.

**Expected result:** the key id is gone from the account's key list.

#### A3. Stripe Dashboard settings (M3, M4)

**Where:** dashboard.stripe.com, account **regroup-app.com**, **live mode**.

1. **Webhook events.** Developers → Webhooks → the endpoint ending `…/phoenix-cleanhouse.cloudfunctions.net/stripeEvents`
   (`we_1UNgxzKsstp3aqoPyxhYJkuY`) → ⋯ → Update details → Select events. Keep the existing 11 and add:
   - `customer.subscription.created`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_action_required`
2. **Connect webhook event (S1, #292).** Developers → Webhooks → the endpoint ending
   `…/handleStripeConnectWebhook` (`we_1UNgzIKsstp3aqoPeAGheDy3`) → ⋯ → Update details → Select events.
   It listens to connected accounts and has only `account.updated` and `account.application.deauthorized`
   (read 2026-11-22). Add **`payout.failed`**, so a house's failed bank payout reaches its admins. It's safe
   before the deploy: today's code answers an unhandled event with 200.
3. **Customer Portal.** Settings → Billing → Customer portal:
   - **Payment methods:** allow customers to update.
   - **Invoice history:** on.
   - **Cancellations:** allow, at the end of the billing period.
   - **Subscriptions → Switch plans:** either off, or on with only the 12 Regroup tier prices (the six
     monthly `price_1TkbS*` and the six annual `price_1UeYj*` in `regroup/scripts/stripe-prices.env`).
   - Business information: the support email, plus the privacy policy and terms URLs
     (`https://regroup-app.com/privacy-policy`, `https://regroup-app.com/terms`).
   - **Save.**

**Expected result:**

- the `stripeEvents` endpoint lists 14 events, and the Connect endpoint 3;
- the portal page shows "Active";
- `stripe billing_portal configurations list --live` returns one configuration with `is_default: true`.

#### A4. Check the publishable keys and webhook signing secrets (B3b, B3c)

1. **Publishable keys.** Developers → API keys (live) shows Regroup's `pk_live_…`. It must equal:
   - the web key in `regroup/web/src/environments/environment.prod.ts` (the `stripePublishableKey` line);
   - the mobile release key: the `STRIPE_PUBLISHABLE_KEY` value in the release `BUNDLED_ENV` you build with
     (`regroup/mobile/CLAUDE.md` describes where it comes from).

   If either differs, replace it with Regroup's key before building. A key from the Homegroups App
   account makes every card confirm fail.

2. **Webhook signing secrets.** These checks happen after C3, once the functions are on version 7. For
   each endpoint (`stripeEvents` and the Connect endpoint `handleStripeConnectWebhook`), Developers →
   Webhooks → the endpoint → **Send test webhook**. Then read the function's log:
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="stripeevents" AND severity>=WARNING' --project phoenix-cleanhouse --freshness=10m --limit=20
   ```
   A signature error means `STRIPE_WEBHOOK_SECRET` (or `STRIPE_CONNECT_WEBHOOK_SECRET`) isn't that
   endpoint's signing secret. Copy the endpoint's **Signing secret** (Reveal), then add it the same safe
   way as the key:
   ```bash
   read -rs "s?Signing secret: "; echo; printf '%s' "$s" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --project=phoenix-cleanhouse --data-file=-; unset s
   ```
   Then redeploy `stripeEvents` (`firebase deploy --only functions:stripeEvents --project phoenix-cleanhouse`).

**Expected result:** both test events are logged as handled, with no signature error.

### Part B — App links and store prerequisites (start now; outside lead times)

#### B1. App links (B5, the console half)

The live `https://regroup-app.com/.well-known/assetlinks.json` names package `com.rats.dev` with a
SHA-256 that matches neither the debug key nor the upload key. The Android app is `com.regroup.app`. The
live `apple-app-site-association` names a different Apple team ID from the one in the repo. Firebase
Hosting generates both files from the apps registered in the project.

1. Firebase console → `phoenix-cleanhouse` → Project settings → Your apps:
   - **Android** `com.regroup.app`: add the **app signing** SHA-256 from Play Console → Setup → App
     signing. That page needs the approved Play account (owner track). Add the **upload** key's SHA-256
     too.
   - **iOS:** confirm the bundle ID the App Store listing uses (`com.rats.dev` per the Xcode target, an
     open question in the plan), and set the Team ID from developer.apple.com → Membership.
2. After the hosting deploy (C6), check:
   ```bash
   curl -s https://regroup-app.com/.well-known/assetlinks.json
   curl -s https://regroup-app.com/.well-known/apple-app-site-association
   ```

**Expected result:** assetlinks names `com.regroup.app` with the Play app-signing SHA-256, and the AASA
names the team ID and bundle ID of the live listing.

#### B2. Privacy policy and claims (B8, the legal half)

The live policy (`https://regroup-app.com/privacy-policy`, source
`regroup/web/src/app/components/terms/privacy-policy/terms.ts`) needs these changes before submission:

- **Remove the "working draft for legal review" ending.**
- **Say what the app actually collects:** medication names and doses (the medication log), drug-test
  results, documents and their files, location (house search and check-ins), and contact details.
- **List the processors:** Google Firebase/Cloud, Stripe, SendGrid, Google Maps and Sentry.
- **"HIPAA compliant":** #295 removes the claim from the website (`discover-two`, `work`), since the
  policy already says this data isn't PHI. Put it back only if a Google Cloud BAA covers the services
  holding resident data, and say so in the policy too.
- **Contact domain:** one, `regroup-app.com` (the policy uses `regroup.app`).

Get legal review of the final text. The code PR fixes the app's link, which pointed at `/privacy`, a 404.

**Expected result:** the policy reads as final, and every data type the app collects is named.

#### B3. Store listings (B7, the owner track)

- **App Store Connect:**
  - App Privacy answers matching B2: use the table in
    `regroup/docs/operations/manual-tasks/2026-11-22-app-privacy-answers.md` (#291), which matches the app's
    `PrivacyInfo.xcprivacy`;
  - age rating;
  - the privacy policy URL `https://regroup-app.com/privacy-policy`;
  - in the review notes, a demo operator account with an entitled house.
- **Play Console** (after the account is approved):
  - Data safety answers matching B2 (the same doc's Play section);
  - the app content declarations (health: "no"; it's a recovery-housing tool, not medical);
  - the privacy policy URL;
  - an internal testing track first.

### Part C — The production deploy (after the freeze lifts; one sitting, in order)

Run from the clean worktree's `regroup/` (see Prerequisites). Each step has its own expected result. If
one fails, stop and see Rollback.

#### C1. Generate and check the production config

```bash
npm --prefix functions ci
npm --prefix functions run env:write -- --project phoenix-cleanhouse
npm --prefix functions run preflight:billing -- --strict
```

`env:write` writes the gitignored `functions/.env.phoenix-cleanhouse` from `scripts/stripe-prices.env`,
the one reviewed list. It holds all 12 tier price IDs, `CONNECT_BASE_URL`, the rent-fee values and
`TIER_BILLING_ENABLED`.

**Expected result:** the preflight prints `config source: functions/{.env.phoenix-cleanhouse}` and exits 0.

#### C2. Prove the config against live Stripe before deploying

```bash
npm --prefix functions run stripe:verify-live -- --project phoenix-cleanhouse
```

The check is read-only. It takes the latest `STRIPE_SECRET_KEY` from Secret Manager into memory, checks
that the key's account is `acct_1GfryQKsstp3aqoP`, and retrieves every `STRIPE_PRICE_*` in the env file.

**Expected result:** `account acct_1GfryQKsstp3aqoP OK`, and 12 prices OK, live and active.

#### C3. Functions

First compare `firebase functions:list --project phoenix-cleanhouse` with `ALL_FUNCTIONS` in
`scripts/deploy-batched.sh`. If the deploy offers to delete a function no longer exported, decide
beforehand.

```bash
npm --prefix functions run build
firebase deploy --only functions --project phoenix-cleanhouse
```

**Expected result:** every function deploys, including the two new ones (`getDocumentLink` and
`resolveFailedPaymentOffline`). Then:

```bash
gcloud functions describe createOperatorSubscription --region us-central1 --project phoenix-cleanhouse --format='value(serviceConfig.secretEnvironmentVariables)'
```

shows `STRIPE_SECRET_KEY` at version **7**, and the same command for `connectStripeAccount` with
`--format='value(serviceConfig.environmentVariables.CONNECT_BASE_URL)'` prints
`https://regroup-app.com/connect`.

#### C4. Rules

```bash
cd mobile
npm run deploy:rules:dry
npm run deploy:rules
cd ..
```

**Expected result:** both the Firestore and Storage rulesets release. The dry run compiles cleanly.

#### C5. Indexes

```bash
cd mobile && npm run deploy:indexes && cd ..
```

**Expected result:** `firebase firestore:indexes --project phoenix-cleanhouse` includes the two
`drug-tests` and two `chat` indexes. Index builds can take minutes.

#### C6. Web hosting (the `/connect` rewrites)

```bash
cd web
npm ci
npm run build
npm run deploy
cd ..
```

**Expected result:** `curl -s https://regroup-app.com/connect/stripe-return | head -c 300` no longer shows
the Angular page (`<app-root>`); it shows the function's response.

#### C7. Let the functions account sign document links

```bash
P=phoenix-cleanhouse
N=$(gcloud projects describe $P --format='value(projectNumber)')
SA="$N-compute@developer.gserviceaccount.com"
gcloud services enable iamcredentials.googleapis.com --project $P
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator --project $P
```

**Expected result:** `gcloud iam service-accounts get-iam-policy "$SA" --project $P` lists
`roles/iam.serviceAccountTokenCreator` for the account itself.

#### C8. The webhook secret check

Now run A4 step 2.

#### C9. Alerts on the money paths (M10, the ops half)

Production has one alert policy (account deletion). Nothing tells you when rent charging, rent
collection or a Stripe webhook fails. The app side (render crashes to Sentry) is #287.

1. Console → Monitoring → Alerting → **Edit notification channels** (project `phoenix-cleanhouse`): add
   an Email channel to an inbox you read. Skip this if the account-deletion policy's channel already is one.
2. Console → Logging → **Logs Explorer**, project `phoenix-cleanhouse`. Paste this query. Gen2 functions
   log under Cloud Run, with the service name in lowercase:

   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name=("rentcharges" OR "scheduledrentcollection" OR "stripeevents" OR "handlestripeconnectwebhook" OR "weeklytransfers" OR "createoperatorsubscription")
   severity>=ERROR
   ```

   **Run query.** On a quiet day it should return nothing, or only errors you already know about.
   `createoperatorsubscription` is there for #290: when checkout's records can't be written, it cancels
   the new Stripe subscription and logs an error. If that cancel also fails it logs "Checkout subscription
   left live with no records: cancel it by hand", with the subscription and customer ids. Cancel that
   subscription in the Dashboard the same day.

3. **Actions → Create log alert.** Name it `regroup money-path errors`. Keep the query. Set
   "Time between notifications" to 5 minutes and "Incident autoclose" to 1 day, then pick the C9.1
   channel and **Save**.
4. Add a second alert for a job that stops running, which errors alone don't show. Monitoring →
   Alerting → **Create policy** → metric **Cloud Scheduler Job → Job attempts** (`scheduler.googleapis.com/job/attempt_count`). Filter
   `job_id` to the `rentCharges` job (`firebase-schedule-rentCharges-us-central1`) and set
   **Metric absence** to 3 hours, since it runs hourly at :05. Use the same channel and **Save**.

**Expected result:** Monitoring → Alerting lists three policies. To check the first one, Logs Explorer →
the query → **Create log alert** → **Preview** shows matches over the last 7 days. If it shows none,
widen the window rather than writing a test error to production.

**If it fails:** if the query returns nothing at all over 30 days, even without `severity`, check the
service names with
`gcloud run services list --project phoenix-cleanhouse --region us-central1 --format="value(metadata.name)"`.

### Part D — Open sales (B4)

After C3, checkout refuses unless `config/sales.open` is true. Open it only when you're ready to take
customers.

```bash
cd functions
npm run switch:set -- --switch=sales --value=true          # prints current and intended, writes nothing
npm run switch:set -- --switch=sales --value=true --apply  # check the project it names first
```

**Expected result:** the second command reports `config/sales.open: true` on `phoenix-cleanhouse`. To
close sales again, run the same with `--value=false`.

### Part E — Store builds (B7)

1. **Device pass** on physical iOS and Android devices, from `main`. Use
   `regroup/docs/operations/manual-tasks/2026-11-11-rn-0.88-device-runbook.md`, and record the DEVS rows in
   `regroup/mobile/docs/e2e/coverage-matrix.md`.
2. **iOS:** Xcode → `regroup/mobile/ios/rats.xcworkspace`, scheme `rats`, Release → Product → Archive →
   Distribute → App Store Connect. Bump the version and build first (the current ones are 1.53 (40)).
3. **Android:** sign with the upload key and run `cd regroup/mobile/android && ./gradlew bundleRelease`.
   Upload `app/build/outputs/bundle/release/app-release.aab` to the internal track, then production.
   The current version is 0.55 (39).
4. **Review notes:** the demo operator account and what a reviewer should try.
5. **Before release:** the owner's notice to existing operators (roadmap owner track, P10 step 10.1).

## Verification

After C1–C8 and D:

- **A test signup on the web** (`https://regroup-app.com/signup`) with a real card reaches the trial. In
  Stripe, a customer and a `trialing` subscription on a tier price appear on **regroup-app.com**.
- **On the phone, the operator connects a bank account:** Stripe onboarding opens and returns to the
  app, and Payments shows the new status without leaving the screen (#294). Then
  `stripe accounts list --live --limit 3` shows the new connected account.
- **An invite email opens the app's invite screen** on iOS and Android.
- **A resident pays rent,** and the payment shows on Regroup's account with a transfer to the house's
  connected account.
- **Refund that test payment** (Dashboard → Payments → Refund), then cancel the test subscription.

## Rollback

- **Functions:** redeploy the previous commit's build (`git switch --detach <previous main>`, then C3). The
  old code has no sales switch, so close sales first (D, with `false`) only if you're on the new code.
- **Rules:** `firebase deploy --only firestore:rules,storage --project phoenix-cleanhouse` from the
  previous commit's `regroup/mobile/firebase`.
- **Hosting:** Firebase console → Hosting → Release history → roll back.
- **Stripe:** reactivate an archived price with `stripe prices update <id> --live --active=true`, and
  archive a created one with `--active=false`.
- **Secret:** `gcloud secrets versions disable 7 --secret=STRIPE_SECRET_KEY --project=phoenix-cleanhouse`.
  Then `latest` is the Homegroups key again, which is wrong, so redeploy only after adding a correct
  version.

## Notes & Gotchas

- **When the operator portal ships,** delete "(coming soon)" from the compliance export and analytics
  bullets in `regroup/web/src/app/components/pricing/pricing-one/pricing-one.component.html` (#295).

- **Never `gcloud secrets versions add` with `read -p` in zsh.** It stores an empty value; that is what
  created the empty versions 4–6. Use `read -rs "var?prompt"` as above.
- **`npm run deploy:batched` is for deploy quotas only.** Before #285 it deploys production with
  whatever `lib/` holds, with no `--project` and no build. From #285 it needs
  `-- --project <id>` and builds first. Run `env:write` before it, as for C3.
- **Staging (`regroup-e2e`) already matches `main`** (2026-11-22). Rehearse C3–C6 there first with
  `--project regroup-e2e`. `env:write` refuses `regroup-e2e` (only production has a committed source), so
  keep staging's own `functions/.env.regroup-e2e` with its sandbox price IDs; the preflight refuses the
  deploy without it.
