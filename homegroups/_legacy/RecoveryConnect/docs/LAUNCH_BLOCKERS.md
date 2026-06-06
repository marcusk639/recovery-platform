> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Launch Blockers — Manual Action Required

**Last updated:** 2026-05-27
**Owner:** Marcus

> **Full checklist (code + infra + App Store + revenue):** [`docs/PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md)

These items can't be resolved by code. They need either access to external consoles, physical devices, or in-person meetings. Ordered by critical-path impact.

---

## P0 — Ship the App

### 1. Run the full claim-and-pay flow yourself

**Why:** No one has completed the funnel as a real first-time customer. Every bug or friction point you hit is one a real admin would hit. Catches issues no automated review finds.

**How:**

1. Open https://recovery-connect-cad4b.web.app on your laptop, incognito
2. Pick an unclaimed group from `scripts/pickSampleGroups.js` output
3. Sign in via Google AND via email/password (two separate passes)
4. Complete Stripe checkout with a real card ($12 to yourself via the project Stripe account)
5. Verify `isClaimed: true` in Firestore console afterward
6. Open the mobile app, log in with the same account, confirm you see the group as admin
7. Repeat on mobile-first: install app, tap claim, go through the mobile→web→back flow

**Write down every friction point.** Copy that reads wrong, buttons in bad spots, confusing state transitions, slow loads. Bring the list back.

### 2. App Store / Google Play submission status

**Why:** Until the app is actually downloadable, every "download the app" CTA on the web leads to a 404 App Store page (`id0000000000` is a placeholder). Apple review typically takes 1–7 days, rejections reset the clock.

**How:**

- Confirm current status in App Store Connect and Google Play Console
- If NOT submitted: submit now. This is critical-path.
- If submitted and awaiting review: note the submission date
- If LIVE: get the real App Store ID (the numeric part after `id` in the URL) and post it here so we can replace the placeholder in `web/src/lib/deepLinks.js:9`

**Real App Store ID:** **\*\***\_**\*\*** (fill in when available)

### 3. Firebase Auth → Authorized Domains

**Why:** Google OAuth popup fails silently if the deployed domain isn't in the Auth authorized-domains list. Users see "popup closed" instead of signing in.

**How:**

1. Open https://console.firebase.google.com/project/recovery-connect-cad4b/authentication/settings
2. Scroll to "Authorized domains"
3. Confirm these are listed:
   - `recovery-connect-cad4b.web.app`
   - `recovery-connect-cad4b.firebaseapp.com`
   - `localhost` (for local development)
4. If `homegroups-app.com` is being set up as custom domain, add it here when DNS is configured

### 4. Email sender configuration for verification emails

**Why:** Firebase sends email-verification messages from `noreply@recovery-connect-cad4b.firebaseapp.com` by default. That domain triggers spam filters — Gmail in particular frequently routes it to Spam. Recovery community users seeing a verification email in spam = lost conversion.

**How:**

1. Firebase Console → Authentication → Templates → Email address verification
2. Customize the "From" name (e.g. "Homegroups")
3. If you have a proper sending domain, configure it via Firebase's custom domain email sender (requires DNS SPF/DKIM records)
4. Consider sending a test verification email to a Gmail account to verify it lands in the inbox, not spam

### 5. RATS_API_KEY — set in Cloud Secret Manager for production

**Why:** The `getMeetingAttendance` HTTP endpoint (`functions/src/http/getMeetingAttendance.ts`) authenticates rats-v2 sober-living app calls via a bearer token (`Authorization: Bearer <RATS_API_KEY>`). Without the secret bound, every call returns `401`.

> **Updated 2026-05-25:** `functions/src/utils/stripe.ts` was refactored to lazy-init env-var checks via a `Proxy` (no longer validates at module load). Deploys now succeed without `RATS_API_KEY` present; only the RATS endpoint itself fails until the secret is bound. The old "deploy crashes during source-analysis" behavior described in earlier versions of this doc no longer applies.

**How:**

1. Retrieve the existing key value from the rats-v2 admin dashboard, or generate a new one (any cryptographically random string works — recommend `openssl rand -hex 32`)
2. If generating new: update the rats-v2 app to use the new key for its `getMeetingAttendance` requests
3. Upload to Cloud Secret Manager for the production project:
   ```
   firebase use recovery-connect-cad4b
   printf '%s' "$RATS_API_KEY" | firebase functions:secrets:set RATS_API_KEY --data-file=-
   ```
4. Verify: `firebase functions:secrets:access RATS_API_KEY`
5. Uncomment `RATS_API_KEY` in the `setGlobalOptions({ secrets: [...] })` block in `functions/src/index.ts` (currently commented out pending the secret being uploaded)

---

## P1 — Unblock Revenue Beyond the First 10 Groups

### 5. Custom domain decision

**Why:** Every link preview currently shows `recovery-connect-cad4b.web.app` — not memorable, not brandable, not what's on any existing marketing material. Three files reference the origin as a constant and need to flip together when DNS is ready.

**Options:**

- Stay on the Firebase default (free, ugly, works today)
- Configure `homegroups-app.com` as custom domain in Firebase Hosting (one-time DNS setup, ~24h propagation)

**When switching, update these constants in one PR:**

- `web/src/lib/deepLinks.js:12` (`WEB_ORIGIN`)
- `web/src/components/GroupPageHead.js:4` (`SITE_ORIGIN`)
- `mobile/src/components/invites/InviteShareSheet.tsx:34` (`JOIN_BASE_URL`) — hardcoded to `https://homegroups.app/join` (audit D-20). Every shared mobile-invite link currently points to a non-existent host.
- `mobile/src/components/payments/SubscriptionWebView.tsx:37` (`PAYMENT_BASE_URL`) — points to the deployed Firebase origin (`recovery-connect-cad4b.web.app`). Must flip together with `WEB_ORIGIN` so in-app subscription checkout keeps working.
- `functions/src/callable/createIntergroup.ts` (`ALLOWED_REDIRECT_ORIGINS`) — server-side allow-list for `successUrl` / `cancelUrl` redirects. If the new domain is not added here, intergroup and treatment-center checkout will reject the redirect URLs and fail with `invalid-argument`.
- `web/public/.well-known/apple-app-site-association` (no change — AASA is domain-scoped; the new domain serves its own)
- Firebase Auth → Authorized Domains (add new domain)
- iOS app's `Associated Domains` entitlement in Xcode (add `applinks:homegroups-app.com`)
- Android `assetlinks.json` — new domain needs its own file if custom domain replaces the Firebase one

### 6. Stripe production key verification

**Why:** The web app loads Stripe via `REACT_APP_STRIPE_PUBLISHABLE_KEY`. If that env var is unset at build time, Stripe Elements fails to initialize and **no one can subscribe**. Audit D-19 flagged this as revenue-zero failure mode.

> **Updated 2026-05-27:** `web/src/pages/SubscribePage.js` now throws at module load if the env var is missing or equals the literal `"pk_test_your_publishable_key"` placeholder. The silent revenue-zero fallback is gone; a misconfigured deploy will now fail loud (the SubscribePage route crashes with a clear error) instead of silently breaking every checkout. Verification is still required to confirm the **production** key is bound — the throw only catches the worst case.
>
> Mobile `PAYMENT_BASE_URL` (`mobile/src/components/payments/SubscriptionWebView.tsx:37`) now points to the actually-deployed Firebase origin (`recovery-connect-cad4b.web.app/subscribe`) instead of the non-resolving `homegroups-app.com`. Added to the custom-domain-flip list in #5.

**How (verify production key is bound):**

1. Open any deployed page's DevTools network tab, filter for `stripe.com`, check which publishable key is sent
2. If `pk_test_...` (a real test key) → need to set production key in the deploy environment and redeploy
3. If `pk_live_...` → confirmed

### 7. Attend 3 intergroup meetings in your metro area

**Why:** The product-strategy doc's single most important validation step. Every hour in a room with real GSRs is worth a week of code polish.

**How:**

- Find intergroup meetings in your metro (AA intergroup directories publish these publicly)
- Bring a laptop
- Show each GSR their group's public page (use `scripts/pickSampleGroups.js` for their city)
- Demo the treasury handoff specifically — the one feature guaranteed to resonate
- Ask them to walk through the claim flow on their phone right there

**Target:** 3 meetings in 2 weeks. Each one = 3–5 candidate pilot admins.

### 8. 30-group pilot outreach

**Why:** Roadmap's stated goal. You can't know whether the product works until 30 actual admins are using it.

**How:**

- Direct outreach to the admins you meet in #7
- Personal email with their group's public page URL
- Call every admin who activates within the first week
- Track conversion in a simple spreadsheet (group, date contacted, date signed up, date paid, notes)

---

## P2 — Nice to Have Before 100 Groups

### 9. Forgot-password flow — ✅ RESOLVED 2026-05-27

> **Updated 2026-05-25 (D-30):** Forgot-password IS wired on web (`web/src/pages/ClaimGroupPage.js:319` calls `sendPasswordResetEmail`). The earlier "currently absent on web" note was stale.
>
> **Updated 2026-05-27:** Mobile `LoginScreen.tsx` "Forgot password?" link was a stub showing "Coming Soon" — it now navigates to the existing `ForgotPasswordScreen`, which has been fully implemented (calls `auth().sendPasswordResetEmail()` and handles `auth/user-not-found` / `auth/invalid-email` error codes). Email/password mobile users have a working in-app recovery path.

### 10. Rate limiting on `getPublicGroupProfile`

Unauthenticated callable with no per-IP throttle. At low traffic this is fine; a scraper could hammer it. Add `firebase-functions-rate-limiter` (or equivalent) once traffic justifies.

### 11. Flip `noindex` → `index` on unclaimed groups

When ~100–200 groups are claimed, remove the `noindex` meta on unclaimed pages so the 62K scraped pages start accruing SEO value. Single-line change in `web/src/components/GroupPageHead.js`.

### 12. Custom SEO-friendly group URLs (optional)

Current URL: `/groups/00005a07824ca170ef5046d32c9286215ffc3233963ea33f6afef71c1b9dd9ec` — a SHA hash is unfriendly for sharing and SEO. Consider adding a slug field (`placitas-bb-group-placitas-nm`) and redirecting hash → slug. Not critical for launch.

### 13. App Check enforcement on sensitive callables (D-35)

> **Updated 2026-05-27:** Investigated current state. App Check is **not installed anywhere** — no `@react-native-firebase/app-check` in `mobile/package.json`, no `firebase/app-check` usage in `web/`, no `initializeAppCheck()` calls in source. So this isn't a "flip a flag" change — it's a full client+server rollout. Flipping `enforceAppCheck: true` on callables right now would break every Stripe checkout for every user. Do **not** flip the flag until at least step 1+2 below are done.

**Why:** None of the 90 callables (including `createIntergroup`, `upgradeIntergroupTier`, `createGroupSubscription`) set `enforceAppCheck: true`. There is no per-user rate limit and no idempotency key. Abuse mitigation depends on Firebase project-level quotas — which are coarse. A malicious or buggy client could create thousands of intergroup checkout sessions before being throttled.

**How (in this exact order — out-of-order breaks Stripe checkout):**

1. **Firebase Console** — enable App Check for the `recovery-connect-cad4b` project: DeviceCheck (iOS) + Play Integrity (Android) + reCAPTCHA v3 (web). Configure debug tokens for local dev. Initial mode: **monitor only**, not enforce.
2. **Install client SDKs and initialize**:
   - Mobile: `npm install @react-native-firebase/app-check` in `mobile/`, initialize early in app bootstrap (before any Firebase callable is invoked). Configure the iOS / Android native providers per `@react-native-firebase/app-check` docs.
   - Web: `import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'` in `web/src/lib/firebase.js`, initialize with reCAPTCHA v3 site key before any `httpsCallable()` call.
3. **Verify in Firebase Console** — App Check metrics show legitimate-traffic tokens flowing. Wait ~1 week of real usage to confirm no false-positive rejections from old clients still in the wild.
4. **Add `enforceAppCheck: true`** to the v2 `onCall` options for the Stripe-touching callables first: `createIntergroup`, `upgradeIntergroupTier`, `createGroupSubscription`, `setupSubscriptionPaymentMethod`. Deploy.
5. **Monitor rejection rate** for ~1 week before tightening to more callables.

**Risk if skipped:** Low impact at <100 groups. Becomes meaningful as DAU grows and bad actors discover the unauthenticated surface area.

---

## Reference

- Spec: `docs/superpowers/specs/2026-04-14-public-group-page-design.md`
- Plan: `docs/superpowers/plans/2026-04-14-public-group-page.md`
- Claim flow memory: `~/.claude/projects/-Users-marcusklein-dev-RecoveryConnect/memory/project_public_group_page.md`
- Firebase project: `recovery-connect-cad4b`
- Live hosting URL: https://recovery-connect-cad4b.web.app
