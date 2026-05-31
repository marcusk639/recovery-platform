# regroup/CLAUDE.md

**Regroup** (app name: **RATS** — Regroup Addiction Tracking System) is a sober living house management platform for operators, staff, and residents. It is part of the `recovery-platform` monorepo.

**Target users:** Sober living house operators / managers, and their guests (residents in recovery).

**Firebase project:** `phoenix-cleanhouse`

---

## Stack

| Layer     | Technology                                                 |
| --------- | ---------------------------------------------------------- |
| Mobile    | React Native 0.72, TypeScript, Redux Toolkit, Firebase SDK |
| Functions | Firebase Cloud Functions v1, TypeScript, Stripe, SendGrid  |
| Web       | Angular, TypeScript, Firebase Hosting                      |

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
- **Subscription model:** Operators pay per-house and per-guest. `OperatorSubscription` in Firestore tracks Stripe `customerId`, `subscriptionId`, and a `houses` map.

---

## Key Docs

| File                         | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `mobile/CLAUDE.md`           | RN app deep-dive                        |
| `functions/CLAUDE.md`        | Cloud Functions architecture            |
| `FUNCTION_AUDIT.md`          | Audit of current function inventory     |
| `mobile/PRODUCT_ROADMAP.md`  | Product roadmap                         |
| `mobile/PRICING_STRATEGY.md` | Pricing and subscription model overview |
