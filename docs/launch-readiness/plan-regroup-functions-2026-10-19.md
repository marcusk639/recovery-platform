# Launch readiness — regroup/functions — 2026-10-19

**Targets:** `regroup/functions` (Cloud Functions, project `phoenix-cleanhouse`). Sibling code
was read only to verify call sites.

**Docs reconciled:** 5 documents, 34 claims (a narrow dry run of the upgraded skill). Full ledger:
[ledger-regroup-functions-2026-10-19.md](ledger-regroup-functions-2026-10-19.md)

**Previous plan:** [plan-regroup-2026-10-02.md](plan-regroup-2026-10-02.md). That plan covered
all of regroup; its functions items are re-verified here.

## 1. Verdict

Not yet. This run found no blocker in the one-off rent path on `main` (it was not exercised in live mode), but **nothing merged
since 2026-10-13 is deployed** (REV-03). That includes the payment-unit fix, payment read
scoping, and the Accounts v1 Connect path. So production still runs code with known money bugs.

The binding constraint is **scheduled autopay**. It charges residents but never routes the money
to the house, because the destination field it reads is never written (REV-01). That fails the
bar ("the money lands in the right account") for every autopay charge, and a deploy doesn't fix
it.

Fix autopay first. Then deploy all functions by a path that actually includes them all (not
`deploy:batched`), deploy rules and indexes, and run the payment migration against that deploy's
timestamp.

## 2. Go-live backlog

### BLOCKER — prevents the first paying customer (dependency order)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                  | ENG/OPS | Ledger IDs                     | Level | Confidence | Effort      | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ----- | ---------- | ----------- | ---------- |
| 1   | **Route autopay to the house.** Resolve the guest's house and use `house.stripeAccountId` as `transfer_data.destination`, only when `house.stripeStatus === "active"`, else skip and record. Remove the `guest.stripeConnectId` read, which nothing writes. Test with fixtures that have no `stripeConnectId`, as production does                                                     | ENG     | REV-01, ST-02                  | L1    | high       | hours–1 day | —          |
| 2   | **Commit the functions `ignore` list** in `regroup/firebase.json` (keep the CLI defaults; add `*.local` and `**/*service-key*.json`) **before the next deploy**, so the deploy doesn't upload `.secret.local` or a service-account key                                                                                                                                                | ENG     | REV-04                         | L1    | high       | < 1 hour    | —          |
| 3   | **Deploy all regroup functions** with `firebase deploy --only functions` from `regroup/`, **not** `npm run deploy:batched`. Its hardcoded list skips 14 functions, including `scheduledRentCollection` (item 1's fix) and the invitation and billing callables. Keep `CONNECT_ACCOUNTS_API` unset (v1). Confirm with `gcloud functions list` that every function's `updateTime` moved | OPS     | REV-03, RF-01, P1002-2, REV-05 | L5    | high       | 1–2 hours   | 1, 2       |
| 4   | **Run the payments-in-cents migration** against item 3's deploy timestamp. Dry run first (`npm run migrate:payment-cents:dry-run -- --deployed-at=<item 3's deploy time>`), review the refused documents, then `--apply`. Running it before item 3, or with a later cutoff, multiplies real cents by 100                                                                              | OPS     | REV-02, RF-03, RG-03           | L1    | high       | hours       | 3          |
| 5   | **Deploy Firestore rules and indexes**: `npm run deploy:rules` in `regroup/mobile`, then `firebase deploy --only firestore:indexes`. #96's `stripeAccountApi` rule and any new composite indexes aren't live until then                                                                                                                                                               | OPS     | P1002-7, RF-06                 | L1    | high       | < 1 hour    | 3          |

### MUST-FIX BEFORE LIVE — puts real customers' money, data, PII or trust at risk

| #   | Item                                                                                                                                                                                               | ENG/OPS | Ledger IDs              | Level | Confidence | Effort   | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- | ----- | ---------- | -------- | ---------- |
| 6   | **Confirm deployed billing config.** `TIER_BILLING_ENABLED=true` and the 12 `STRIPE_PRICE_*` values, including that the annual IDs are live-mode                                                   | OPS     | P1002-4, P1002-8, RF-17 | L1    | medium     | < 1 hour | 3          |
| 7   | **Fix or retire `deploy:batched`.** Derive its list from `src/index.ts`, or stop calling it "preferred" in `regroup/functions/CLAUDE.md`, so the next deploy doesn't silently skip functions again | ENG     | RF-01, P1002-2          | L5    | high       | hours    | —          |

### SHOULD-FIX

| #   | Item                                                                                                        | ENG/OPS | Ledger IDs     | Level | Confidence | Effort   | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------- | ------- | -------------- | ----- | ---------- | -------- | ---------- |
| 8   | Add a committed `deploy:indexes` script, so index deploys stop depending on someone remembering the command | ENG     | RF-06, P1002-7 | L1    | high       | < 1 hour | —          |

### DEFERRED — real work, not needed for launch

| Item                                             | Why it can wait                                              | Ledger IDs   |
| ------------------------------------------------ | ------------------------------------------------------------ | ------------ |
| Doc corrections in `regroup/functions/CLAUDE.md` | Misleading for the next agent, but not for customers. See §6 | RF-02..RF-05 |

## 3. Already done

- **`scheduledRentCollection` now fails loudly.** It rethrows, so Cloud Scheduler records a
  failure (scheduledRentCollection.ts:312-316, PR #85). The previous plan still lists this as
  open (plan-regroup-2026-10-02.md:63). Live only after item 3. (P1002-6)
- **The two Stripe clients share one API-version source** (`util/stripeApiVersion.ts`).
  `regroup/functions/CLAUDE.md:193` still describes two. (RF-05)
- **Accounts v2 being unavailable is handled.** New houses use Accounts v1 behind
  `CONNECT_ACCOUNTS_API` (#96), and each house records its API. (REV-05)

## 4. Risks

- **Production runs pre-#86 code until item 3.** The webhook keeps writing `payments.amount` in
  dollars, so every payment taken before the deploy needs the migration. The longer the deploy
  waits, the more documents depend on the cutoff being right.
- **`.secret.local` (a Stripe test key for another account) was likely uploaded** with the
  2026-10-08 and 2026-10-13 deploys, if they ran from the machine that holds it. It's test-mode
  and in private function-source storage. Consider rolling it.
- **Autopay before item 1:** if autopay is used, each charge takes the resident's money into the
  platform balance and leaves the house unpaid. Refunding or transferring by hand would be the
  only remedy.

## 5. Open questions

- **OPEN QUESTION —** Has autopay ever charged a real resident in live mode? (needed to decide:
  whether any platform-held rent must be transferred to houses or refunded before launch.) This
  needs an approved read of live `payments` / Stripe data.
- **OPEN QUESTION —** Are the deployed `TIER_BILLING_ENABLED` and annual price IDs live-mode?
  (needed to decide: whether item 6 is a no-op or a config change.)

## 6. Doc corrections to hand off

For the `doc-code-audit` skill:

- `regroup/functions/CLAUDE.md`:
  - RF-02: Connect lives in `payments.ts`, not `subscriptions.ts`;
  - RF-03: `payments.amount` is in cents;
  - RF-04: `.env.example` exists;
  - RF-05: there is one API-version source.
- `regroup/docs/operations/stripe-testing.md` ST-02: autopay isn't a destination charge until
  item 1 lands.
- `docs/launch-readiness/plan-regroup-2026-10-02.md:63`: item 6 is resolved.

## 7. Changes since last plan

Relative to plan-regroup-2026-10-02 (functions items only):

- **Newly resolved:** item 6 (scheduled rent fails loudly).
- **Still open:** item 2 (`deploy:batched` list), item 7 (index deploy path).
- **Unverified:** items 4 and 8 (deployed billing config).
- **Newly discovered:**
  - autopay never routes money to the house (REV-01);
  - nothing since 2026-10-13 is deployed (REV-03);
  - the deploy upload includes secrets (REV-04);
  - the payment migration is still unrun (REV-02).

## 8. How this was verified

- **Ledger:** 34 claims — 18 IMPLEMENTED · 1 PARTIAL · 6 CONTRADICTED · 1 STALE-DOC ·
  3 UNVERIFIABLE-HERE · 5 UNDOCUMENTED.
- **Levels reached:**
  - L1 static reads throughout;
  - L5 read-only `gcloud functions list` for deploy state;
  - L4 cited for REV-05 (a test-mode create run on 2026-10-17 with the user's approval). No new
    external calls, and no production data read.
- **Reconciled:** the three CLAUDE.md files on the path, the previous regroup plan's functions
  items, and `stripe-testing.md`.
- **Not reconciled in this dry run:** the other launch-readiness docs, `regroup/docs/technical/`
  (architecture, gap analysis, performance), `go-to-market/`, `product/` and `plans/functions/`.
  A full run should include them.
- **Subagents:** all five parallel subagents stalled in this environment (stream watchdog, no
  output). The ledger was built in the main session. Every BLOCKER and MUST-FIX item was verified
  directly against code or deploy state, not from an agent report.
