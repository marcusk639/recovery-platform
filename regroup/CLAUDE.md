# regroup/CLAUDE.md

**Regroup** is a sober living house management platform for operators, staff, and residents. It is part of the `recovery-platform` monorepo. (The mobile app's internal codename is `rats` — preserved in `app.json` `name`/`displayName` and iOS config for App Store / Firebase continuity. Canonical product name is **Regroup**.)

**Target users:** Sober living house operators / managers, and their guests (residents in recovery).

**Firebase project:** `phoenix-cleanhouse`

---

## Stack

| Layer     | Technology                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Mobile    | React Native 0.72, TypeScript, Redux Toolkit, Firebase SDK                                                  |
| Functions | Firebase Cloud Functions v2 (firebase-functions ^7), TypeScript, Stripe, SendGrid (some v1 legacy triggers) |
| Web       | Angular 9 (EOL — see web/CLAUDE.md), TypeScript, Firebase Hosting                                           |

---

## Subproject Memory

Per-area commands, architecture, and domain rules live in subdirectory CLAUDE.md files, lazy-loaded by Claude Code when working in those directories:

- [`mobile/CLAUDE.md`](mobile/CLAUDE.md) — RN 0.72 app: commands, Redux architecture, navigation, Firestore models, patch-package notes, iOS/Android build details.
- [`functions/CLAUDE.md`](functions/CLAUDE.md) — Cloud Functions: callable/http/trigger architecture, Stripe webhooks, subscription model, secret management.
- [`web/CLAUDE.md`](web/CLAUDE.md) — Angular web portal: commands, Firebase Hosting deploy, structure.

---

## Firebase Emulators (from regroup/ root)

```bash
firebase emulators:start    # Firestore :8080, Functions :5001, Auth :9099
# UI at http://localhost:4000
```

Emulator config is in `firebase.json` at this directory level.

---

## Cross-Product Rules

- **Never log PII** (guest names, contact info, health data) to Cloud Functions logs or client console.
- **Firebase emulator ports** for this product: Firestore 8080, Functions 5001, Auth 9099 (same as homegroups — do not run both simultaneously without port overrides).
- **Service key** for Cloud Functions: `functions/service-key.json` (gitignored). Download from Firebase Console under `phoenix-cleanhouse`.
- **Stripe** amounts are in **US cents** (integers). `50000` = $500.00. Convert at the UI boundary only.
- **Subscription model:** 6-tier flat monthly pricing (`SUBSCRIPTION_TIERS` in `functions/src/config.ts`: Traditional 69/129/249, Oxford 49/89/299), selected at checkout and gated by `TIER_BILLING_ENABLED` / `isTierBillingEnabled()`. **The legacy per-house + per-guest quantity model has been deleted** (2026-09-30) — no operators remained on it. A subscription with no `tier` now raises `failed-precondition` rather than silently no-opping. `OperatorSubscription` tracks Stripe `customerId`/`subscriptionId`; tier subs carry a single `subscriptionItemId`, not the old `items.houseItemId`/`guestItemId` pair.

---

## Key Docs

| File                                           | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `mobile/CLAUDE.md`                             | RN app deep-dive                                            |
| `functions/CLAUDE.md`                          | Cloud Functions architecture                                |
| `FUNCTION_AUDIT.md`                            | Audit of current function inventory                         |
| `../regroup/docs/go-to-market/roadmap.md`      | Product roadmap (GTM SSOT; sources consolidated 2026-06-10) |
| `../regroup/docs/go-to-market/monetization.md` | Pricing and subscription model (GTM SSOT)                   |
