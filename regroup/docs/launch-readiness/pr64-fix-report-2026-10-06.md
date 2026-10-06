# PR #64 review-fix report

**Branch:** `fix/regroup-stripe-config` · **Base:** `ed2d7c9` · **Head:** `c201962`
**Date:** 2026-10-06 · **Scope:** `regroup/functions`, `regroup/scripts`

Durable record of the fixes applied to the review findings on PR #64, including the
findings that were refuted, the mutation testing that backs each claim, and what is
left for a human.

---

## 1. Verification status

| Gate                            | Result                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm test` (`jest --runInBand`) | **54 suites / 854 tests passing** (baseline at ed2d7c9: 53 / 811)                              |
| `npx tsc --noEmit`              | clean                                                                                          |
| `npx jest --coverage`           | ran; **no `coverageThreshold` configured in `regroup/functions`**, so none breached or lowered |
| Mutation tests                  | **27 applied, 27 caught**, every one reverted and the tree re-verified green                   |

Coverage of the files touched: `stripeApiVersion.ts`, `stripeWebhookSecrets.ts`,
`verifyStripeWebhook.ts`, `cardValidation.ts` all **100%**; `stripeWebhook.ts`
91.02% statements / 77.71% branches.

**On the coverage ratchet.** CLAUDE.md names the ratcheted floors in `recovery-api`,
`homegroups/functions` and `detox-recovery`. Verified empirically rather than taken
on trust: each of those three holds `coverageThreshold` in its own `jest.config.*`
(`recovery-api/jest.config.cjs`, `homegroups/functions/jest.config.js`,
`detox-recovery/jest.config.ts`), and `regroup/functions` has **no jest config file
at all** and no `coverageThreshold` key in `package.json`. There was no floor in the
subproject touched here, so nothing was breached and nothing lowered.

### Worktree discipline

All work in
`/private/tmp/claude-501/-Users-marcusklein-dev-recovery-platform/6e58f75c-0f94-4ff3-a21d-d687ac3891ee/scratchpad/wt-stripe`.
`pwd` and `git rev-parse --abbrev-ref HEAD` confirmed before the first commit and
again before each subsequent one. Nothing committed to `main`; no `git worktree
remove`; no deploy command, no `firebase functions:secrets:access`, no merge, no
rebase. `regroup/functions/.env` and `.env.example` never read or written.

---

## 2. Commits

| SHA       | Message                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `33f3fc3` | `fix(regroup-functions): refuse a verified webhook event from the wrong Stripe mode` |
| `aaf9762` | `fix(regroup-functions): make the preflight gates report what they actually do`      |
| `291e446` | `test(regroup-functions): prove each Stripe client uses the centralized API version` |
| `92daa90` | `docs(regroup-functions): name both pins that block allowed_payment_method_types`    |
| `e0c6687` | `style(regroup-functions): drop unrelated reformatting from config.ts`               |
| `c5e9efe` | `fix(regroup-functions): derive the webhook mode guard from the bound key alone`     |
| `83bfbb2` | `feat(regroup-functions): log the Stripe API version in force at startup`            |
| `c201962` | `docs(regroup-functions): stop claiming the candidate loop survives secret rotation` |

13 files changed, 1310 insertions, 155 deletions. Two added files, both well under
the 300-line cap the pre-commit hook enforces on `--diff-filter=A`:
`src/util/verifyStripeWebhook.ts` (142) and
`src/__tests__/util/stripeApiVersionWiring.test.ts` (148).

---

## 3. BLOCKER 1 — a verified event from the wrong Stripe mode

### The defect

`webhookSecretCandidates` returned both mode secrets and mode only affected
ordering. Both were bound unconditionally to both live functions. The loop accepted
whichever verified and **no handler checked `event.livemode`**. A test-mode event
therefore verified against the live deployment and was processed — and
`handlePaymentIntentSucceeded` resolves its target from **event metadata**, not from
a Stripe lookup, so it decremented `rentOwed` on a real guest and wrote a real
payment doc. `handleSubscriptionUpdated` / `updateHouseSubscriptionStatus` were
reachable the same way.

Confirmed a regression against `ed2d7c9~1`, rather than assumed: the prior
`resolveWebhookSecret("platform")` resolved **one** secret from the deployment's own
mode, so a cross-mode event failed verification and returned 400.

### The prescribed fix was insufficient

The spec asked only that the event's mode agree with the mode of the **secret that
verified**. That does not close the hole. On a live deployment the test secret is
also bound; a holder of the test signing secret signs a `livemode:false` event, it
verifies against the test candidate, the two modes **agree**, and production
Firestore is mutated anyway.

### What was implemented

Two independent assertions, applied after verification, in both handlers. Neither is
sufficient alone:

1. `event.livemode` must match the mode of the **secret that verified** — stops a
   holder of one mode's secret from claiming the other mode.
2. `event.livemode` must match the mode of **this deployment** — stops a genuine
   test-mode event, correctly signed with the test secret bound here, from being
   acted on against production data.

Together they mean only the deployment's own mode secret yields a processed event,
which is exactly the pre-`ed2d7c9` property, without reintroducing a single-secret
guess. `livemode` is compared with `=== true`, so a payload that omits the field
cannot satisfy a live deployment by absence.

Rejections return the same sanitized `"Webhook Error: signature verification
failed"`. The mode, the verifying secret's name and the deployment mode go to the log
only.

### Framing

The loop forges nothing — stripe-node HMACs each candidate under a 300s timestamp
tolerance (`node_modules/stripe/cjs/Webhooks.js:65-78`). What this closes is
**authorization** of a correctly signed event from the wrong mode. The code comments
state it that way.

### The before/after-verification distinction

The original docstring was right that `livemode` cannot settle the mode _before_
verification, because the body is unauthenticated then — that governs secret
**selection**. It was over-generalised into never checking the field at all. After a
candidate verifies the body is authenticated and `event.livemode` is trustworthy.
`src/util/stripeWebhookSecrets.ts` now states selection-is-not-authorization
explicitly so the conflation does not recur.

### Exposure (precise)

Not exploitable at the time of writing, and it goes live the moment this branch is
deployed with `STRIPE_TEST_WEBHOOK_SECRET` bound. Both halves are needed:

- **Dashboard side — configured.** Test-mode webhook endpoints are registered
  against both production URLs in the sandbox account `acct_1RXiFg2KPgAtfsl6`:
  `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents`
  (api_version `2025-05-28.basil`) and `.../handleStripeConnectWebhook`
  (api_version `2026-01-28.clover`).
- **Deployment side — not yet true.** This branch is not deployed and the test
  secret binds at deploy time, so no production process currently holds it.

`stripeEvents` is the **deployed alias of `stripeWebhook`** (`src/index.ts:42`), so
those two endpoints map exactly onto the two handlers guarded here. This is a hard
pre-deploy blocker, not a live incident.

---

## 4. BLOCKER 2 — behavioural coverage

The whole 811-test suite passed with multi-candidate verification reverted to a
single candidate, and nothing proved a **wrong** secret was rejected, because
`mockConstructEvent` returned a valid event for every secret and rejection was only
ever simulated by throwing for all of them at once.

`mockConstructEvent` is now **secret-aware** (`constructEventBySecret`), which is the
control these tests need.

### One requested sub-test is unsatisfiable

"Configure two secrets; first throws, second succeeds; **assert the request
succeeds**" cannot exist once Blocker 1 is fixed. There is one env var per mode, so
the two candidates are always opposite modes, and only the deployment-mode secret can
yield an accepted event. Implemented instead as _first throws, second verifies, both
were tried_ — asserted on the secret **values** `constructEvent` was offered — plus a
rejection assertion. That still goes red on a single-candidate revert, which is the
invariant the test exists to pin.

### Tests added

Platform (`stripeWebhook`) and mirrored for `handleStripeConnectWebhook`, which had
received the identical rewrite and none of the coverage:

- tries every configured secret rather than stopping at the first failure
- 400 when no candidate verifies, having tried them all, with no Firestore write
- rejects a **wrong** secret while accepting the right one
- keeps every candidate's error, first and second both present
- rejects a verified **test**-mode event on a **live** deployment, asserting no
  idempotency write and no document mutation
- rejects an event claiming `livemode:true` signed with the **test** secret
- rejects a verified **live**-mode event on a **test** deployment
- treats a payload with no `livemode` field as test-mode
- accepts the one correct combination (live event, live deployment, live secret)
- never names a secret, mode or variable in the rejection body
- `secrets:` arrays asserted on the real `onRequest` options object
- Connect: 500 when neither Connect secret is configured

`STRIPE_CONNECT_TEST_WEBHOOK_SECRET` was previously set by no handler test at all.

---

## 5. Item-by-item disposition

### Original items 1–14

| #   | Item                                          | Disposition                                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | livemode guard                                | **Fixed**, with the spec's single check corrected to two (§3)                   |
| 2   | behavioural coverage                          | **Fixed**; one sub-test shown unsatisfiable (§4)                                |
| 3   | gates documented as blocking but only warn    | **Fixed by correcting the text**; `--strict` deliberately not added (§6)        |
| 4   | `readPinnedApiVersion()` fails silently       | **Fixed** — parse failure is now loud (§6)                                      |
| 5   | tautological API-version assertion            | **Fixed** — override sentinel + source-level guard (§7)                         |
| 6   | harness discards `onRequest` options          | **Fixed** for `webhooks/stripeWebhook.test.ts`; the other half **refuted** (§8) |
| 7   | `verifiedWith` at `logger.debug`              | **Fixed** — raised to INFO, both handlers and candidate resolution              |
| 8   | two false mechanism strings                   | **Fixed** — apiVersion governs outbound shapes only                             |
| 9   | "bound on both webhook functions"             | **Text fixed**; the asymmetry itself is **correct** (§8)                        |
| 10  | `config.ts` documents single-secret behaviour | **Fixed**                                                                       |
| 11  | `beforeEach` "configures every secret"        | **Fixed** — all four now set, making two `delete`s load-bearing                 |
| 12  | ~27 duplicated lines in both handlers         | **Fixed** — extracted `verifyStripeWebhook`; `stripeWebhook.ts` 1364 → 1356     |
| 13  | `verificationError` overwritten               | **Fixed** — all errors kept, each tagged (§9)                                   |
| 14  | `allowed_payment_method_types`                | **Fixed**, provenance separated from local fact (§10)                           |

### Supplement items 15–25

| #   | Item                                            | Disposition                                                          |
| --- | ----------------------------------------------- | -------------------------------------------------------------------- |
| 15  | "Stripe's guidance is to never pass" overstates | **Fixed** — offers and encourages, does not forbid                   |
| 16  | "a bound secret is absent at module load"       | **Narrowed** to deploy-time discovery; conclusion survives (§11)     |
| 17  | new observability untested                      | **Fixed** — all four fields asserted + a no-secret-values test (§12) |
| 18  | rationale duplicated four ways                  | **Fixed** — single owner, handlers point at it (§13)                 |
| 19  | unverifiable review-history comments            | **Fixed**, keeping disproved alternatives (§14)                      |
| 20  | cites regenerable `CODEBASE-REVIEW.md`          | **Fixed** — invariant quoted instead                                 |
| 21  | `let candidates;` untyped                       | **Fixed** — explicit `WebhookSecretCandidate[]` at both sites        |
| 22  | stray double blank line                         | **Fixed**                                                            |
| 23  | unrelated requoting in `cardValidation.ts`      | **REFUTED** — premise does not hold (§15)                            |
| 24  | no runtime signal of the API version            | **Fixed** — one INFO line per cold start (§16)                       |
| 25  | idempotency degrades and continues              | **Recorded only**, as instructed (§18)                               |

### Constraints honoured

- **The mode guard does not read `STRIPE_WEBHOOK_MODE`** (§17).
- The dahlia version number is **attributed, not asserted** (§10).
- `payment_method_types` **not removed** from either call site.
- No `.env` / `.env.example` access. No deploy. No merge or rebase. Commit scopes
  all `fix|test|docs|feat|style(regroup-functions)`.

---

## 6. Preflight gates (items 3, 4, 8, 9) — and a crash found en route

### `errors` was never declared — the gate could never have run

`errors.push(message)` at `preflight-billing.js:248` referenced a variable declared
**nowhere** in the file (a single grep hit for the identifier). The file is
`'use strict'` (line 39), so this threw `ReferenceError: errors is not defined`.

Reproduced against a synthesized config (`TIER_BILLING_ENABLED=true` plus a divergent
`STRIPE_API_VERSION`): the script died with a stack trace at `main (…:248:7)`.

So the API-version divergence gate **could never have reported a divergence**. On the
enforced path it crashed; node exits non-zero, so it did stop the deploy — by
crashing, with no actionable message. On the unenforced path `warnings.push` was used
and the bug was never reached.

Fixed: `errors` declared alongside `warnings`, each entry printed, and
`process.exit(1)` placed **before** the CONFIG report, which can `return` early and
would otherwise have swallowed them.

Verified across four states:

| Config                                    | Result                                        |
| ----------------------------------------- | --------------------------------------------- |
| billing ON + divergent version            | `exit=1`, full message (was `ReferenceError`) |
| billing OFF + divergent version           | warning, `exit=0`                             |
| billing ON + `PINNED_API_VERSION` renamed | `exit=1`, parse-failure message               |
| billing OFF + pin renamed                 | loud warning, `exit=0`                        |

### Item 4 — parse failure made loud

`readPinnedApiVersion()` regex-matched the constant and bare-`catch`ed to `null`; the
consumer then skipped the comparison with **no** warning, so renaming
`PINNED_API_VERSION` or switching it to a template literal silently disabled the
gate. It now returns `{version, problem}`, distinguishes an unreadable file from an
unmatched pattern, and reports at the same severity as a divergence — error under
enforcement, loud warning otherwise.

### Item 3 — text corrected; `--strict` deliberately not added

The directive preferred making the gates genuinely block _only_ if that would not
break a legitimate deploy. It would, for two independent reasons:

1. Under `--strict`, `warnings` are fatal, and `warnings` **always** contains the
   informational `TIER_BILLING_ENABLED is not "true"` line on any pre-go-live
   deploy. Every such deploy would be blocked by its own advisory notice.
2. A `[SECRET]` finding fires whenever `firebase functions:secrets:access` cannot
   confirm a secret. That call needs `secretmanager.versions.access` — a permission
   a deployer does **not** otherwise require, since deploying needs only
   `versions.get` / `setIamPolicy`. Wiring `--strict` into the predeploy would block
   legitimate deploys on a permission the deploy itself does not need.

The script header now records that reasoning, plus the rule: _nothing in this script
should claim a gate blocks unless it blocks without `--strict`_. The matching false
claim in `stripeApiVersion.ts` ("fails the deploy when the deployed value diverges")
was corrected to name the two conditions under which it actually blocks.

Also noted at that call site, marked **UNVERIFIED**: newer `firebase-tools` may
**prompt interactively** for a missing bound secret rather than hard-failing, which
in non-interactive CI is its own failure mode. Recorded as a reason not to treat the
deploy as a backstop, not as documented behaviour.

### Item 8 — mechanism corrected in two strings

`preflight-billing.js:235` ("object and **event** shapes service-wide") and `:245`
("object and **webhook payload** shapes") asserted a mechanism Stripe does not
implement. A client's `apiVersion` governs **outbound** request/response shapes only;
inbound webhook payload shape is set **per-endpoint in the Stripe Dashboard**. Both
corrected; `stripeApiVersion.ts` already said so and is now consistent.

This is not academic: the two endpoints found in the Dashboard carry api_version
`2025-05-28.basil` and `2026-01-28.clover`, i.e. one of them already diverges from
the pin. See §19.

### Item 9 — text wrong, binding correct

`STRIPE_TEST_WEBHOOK_SECRET` is bound only on `stripeWebhook`;
`STRIPE_CONNECT_TEST_WEBHOOK_SECRET` only on `handleStripeConnectWebhook`. The
asymmetry is **correct**: `webhookSecretCandidates('platform')` reads only the
platform pair and `('connect')` only the Connect pair, so a cross-binding would be
dead weight. Only the text changed, and both arrays are now asserted by test.

---

## 7. Item 5 — the tautology

`PINNED_API_VERSION === '2026-01-28.clover'` is the same literal the four rewired call
sites used to hardcode, so `expect(opts.apiVersion).toBe('2026-01-28.clover')` passes
just as happily against the hardcoding it is meant to forbid. Reverting any call site
broke no test.

Two complementary assertions, both negative, in
`src/__tests__/util/stripeApiVersionWiring.test.ts`:

- **Runtime.** `STRIPE_API_VERSION` is set to a sentinel that is _not_ the pin and
  each client driven to construction. A client wired to the constant reports the
  sentinel; one holding the literal still reports the pin. Each case also asserts
  `not.toBe(PINNED)` explicitly. Covers `util/stripe.ts` `createStripeClient()`,
  `api/stripe.ts`'s lazy Proxy, and `scheduled/scheduledRentCollection.ts`
  `runRentCollection()`.
- **Source level.** Every call site must import the constant and contain **no**
  date-shaped version literal. This is what covers `main()` in
  `scripts/migrateHouseSubscriptionStatus.ts`, which is unexported and builds its
  client behind a `--verify-stripe` argv branch, so it cannot be driven at runtime.

A reviewer independently confirmed the mechanism that makes the override a valid
discriminator: `stripe.core.js:72` is `props.apiVersion || DEFAULT_API_VERSION`, and
`cjs/apiVersion.js:5` equals the pin exactly on stripe@20.3.1 — so `??` would be
wrong and the empty-string-as-unset handling is load-bearing.

---

## 8. Item 6 — half fixed, half refuted

**Fixed.** `webhooks/stripeWebhook.test.ts:92` discarded `onRequest`'s options, so
deleting a `secrets:` binding passed every test while collapsing the candidate list
to one secret in production. The options object is now recorded and the arrays
asserted. Stored on `globalThis` for two reasons: a `jest.mock` factory is hoisted
above module-scope `const`s, and `onRequest` is called at import time, so anything
recorded on the `jest.fn` is wiped by `jest.clearAllMocks()` in `beforeEach`.

**Refuted.** `src/__tests__/stripeWebhook.test.ts:65` mocks `firebase-functions` —
the **v1** `https.onRequest` — but the source imports `onRequest` from
`firebase-functions/v2/https`, and that file has no mock for it. The v1 mock is
therefore never on `stripeWebhook`'s path; the real v2 wrapper runs, which is why the
secret-resolution behaviour works in that file at all. Left unchanged.

---

## 9. Item 13 — collect, not first-only

Two reviewers proposed different fixes; the second is better and is what shipped.
**Every** candidate's failure is kept, each tagged with its candidate name, in the
order tried.

Keeping only one — first _or_ last — loses the diagnostic case. If the correct-mode
secret fails for a reason that is not "wrong secret", such as `Timestamp outside the
tolerance zone` (a replay, which an existing test in
`src/__tests__/stripeWebhook.test.ts` covers), that is the error the operator needs,
and which position it lands in is not knowable inside the loop. The response body
stays a fixed string.

---

## 10. Item 14 — `allowed_payment_method_types`

### Separated local fact from web provenance

**Locally verified and stated as such:** `allowed_payment_method_types` appears **zero
times** in stripe@20.3.1's type definitions, including across
`node_modules/stripe/types/{SetupIntents,SetupIntentsResource,PaymentIntents,PaymentIntentsResource}.d.ts`.
`payment_method_types` appears in 14 files. Installed version read from
`node_modules/stripe/package.json`; declared dependency `"stripe": "^20.3.1"`.

**Not locally verifiable, therefore attributed rather than asserted:** the API version
that introduces the parameter. Stripe's web changelog dates it to
`2026-07-29.dahlia`
(`docs.stripe.com/changelog/dahlia/2026-07-29/allowed-payment-method-types-parameter`),
and this service pins `2026-01-28.clover`. The comments no longer state that version
as established fact; they point at the changelog and tell the reader to confirm it
before acting.

### The real blocker is the semantics, not the version

`allowed_payment_method_types` **silently filters** incompatible payment methods,
whereas `payment_method_types` **errors** on one. `cardValidation.ts` depends on the
erroring behaviour for a determinate `succeeded` / `requires_action` / decline
outcome. Under silent filtering a misconfiguration degrades quietly instead, so the
swap is **not like-for-like** and adopting it needs a deliberate decision about that
tradeoff. This reasoning is in the code comment
(`src/api/cardValidation.ts:111-113`), not only here, because it is what should stop
someone "upgrading" into a silent regression later.

### `payment_method_types` retained

Not removed from either call site. Deleting it breaks behaviour: in
`cardValidation.ts` an off-session SetupIntent then fails for want of a `return_url`;
in `callable/payments.ts` the Payment Sheet stops honouring the resident's chosen
method. Stripe does eventually reject it as a request parameter, but per the same
changelog not until `2026-08-26.preview` and later — well past the current pin.

### Item 15

"Stripe's guidance is to never pass `payment_method_types`" overstated Stripe's
position. Softened to what it is: Stripe offers and encourages
`allowed_payment_method_types` without forbidding `payment_method_types`.

---

## 11. Item 16 — mechanism narrowed

`stripeApiVersion.ts` stated unconditionally that "a bound secret is absent from
`process.env` at module load". That holds for the Firebase CLI's **deploy-time
function discovery**, which loads these modules with no secret bound. It does **not**
hold for the deployed runtime, where Cloud Run mounts secret env vars before the
process starts.

The conclusion survives — this should not become a Secret Manager secret, because a
secret-backed pin would read as absent during discovery and fall back silently — but
the comment now names discovery as the mechanism rather than "module load" generally.

---

## 12. Item 17 — observability assertions

`verifiedWith`, `candidatesTried` and the resolved candidate list are the fields that
separate "wrong secret" from "missing secret" from "wrong mode". None was asserted,
so deleting any of them — or dropping one back to `logger.debug`, where a default
`severity>=DEFAULT` Logs Explorer filter discards it — changed no test. That matters
more now that item 7 raised their level deliberately.

Added in a `webhook diagnostics` describe block:

- names the secret and mode that verified, **at INFO**
- names the resolved candidates and the deployed mode, **at INFO**
- names every candidate tried when none verifies
- names `eventMode` / `deployedMode` / `secretMode` / `verifiedWith` when the mode
  gate rejects — without which a mode 400 is indistinguishable from a signature 400,
  since the response body is identical by design
- **logs no secret VALUE anywhere**, only variable names
- the Connect mirror of the success-log assertion

---

## 13. Item 18 — single owner for the rationale

The "one URL = test + live endpoint; a rolled secret overlaps its replacement"
rationale appeared in four places. `src/util/stripeWebhookSecrets.ts` is now its sole
owner and says so; `verifyStripeWebhook.ts` and both handlers point at it. The
handler comments also stopped narrating the loop that
`for (const candidate of candidates)` already states — the Connect handler's comment
is now one line.

This folded into the item 12 extraction: the duplication is precisely why the missing
mode check was missing in **both** handlers at once.

---

## 14. Item 19/20 — comment hygiene, with a line drawn

Review-history phrasing was replaced by the invariant it was describing, across
`stripeApiVersion.ts`, `stripeWebhookSecrets.ts`, `verifyStripeWebhook.ts` and four
test files: "An earlier version of this module…", "It used to be set in four
places", "the pre-rework code", "which is the point of the rework", "These suites
previously passed…", "Previously only the three live/platform vars were set".

The judgment call, made deliberately: a comment recording a **disproved alternative**
is valuable and was kept, stated as a present-tense invariant rather than as history.
Two were kept on that basis:

- that deriving a single mode from the key's prefix fails the other mode's events —
  this is what stops someone "simplifying" the candidate list away;
- that `apiVersion` does not control inbound webhook payload shapes — the correction
  itself is the value.

Item 20: `stripeWebhook.test.ts:511` cited "a finding already tracked in
`regroup/CODEBASE-REVIEW.md`", a regenerable 25K document with no stable finding ID.
Replaced with the invariant: the response body is a fixed string and never carries
Stripe's raw message.

---

## 15. Item 23 — refuted

The finding stated that 19 of 27 added lines in `src/api/cardValidation.ts` are pure
double→single requoting, and asked that the unrelated requoting be reverted out of a
security-sensitive diff.

The premise does not hold. `cardValidation.ts` is an **added** file in this PR:
`git diff --name-status 84f7669..HEAD` reports `A`, and the diff is **all `+` lines
with no `-` lines**, 143 lines total. There is no pre-existing double-quoted version
to revert to and no requoting in the diff — the lines are simply new, written in
single-quote style. Left unchanged; no files restyled.

Related and separate: `e0c6687` **did** revert genuine churn. The editor's Prettier
hook reflowed all of `config.ts` from double to single quotes when only two comment
blocks changed, putting ~65 unrelated lines into the diff. `config.ts` is now a
27-line comment-only change.

There is no eslint or prettier config in `regroup/functions`, so neither style is
enforced; the hook's config should be checked against this subproject before the next
edit there.

---

## 16. Item 24 — API version visible at runtime

`STRIPE_API_VERSION` resolved at module load with no signal anywhere, while the
file's own comment delegated safety to the billing preflight — the same gate that is
advisory until `TIER_BILLING_ENABLED=true`, carries no `--strict` in the wired
predeploy, and (before §6) could not report at all. A divergent deployed override
could reach production with nothing recording which version was in force.

One INFO line per cold start now names the resolved version, whether it came from the
override or the pin, and the pin it displaced. It depends on no gate.

Safe at module load: a plain config var, never a secret, no PII. It also emits during
the Firebase CLI's deploy-time function discovery, which is harmless and is itself a
useful confirmation of the value about to ship.

`STRIPE_API_VERSION_SOURCE` is exported and tested for all three cases, including
that an **empty** override logs as the pin rather than as a deliberate override —
consistent with the existing empty-string-as-unset rule.

---

## 17. `STRIPE_WEBHOOK_MODE` — verdict: dead weight

### Decoupled from the guard

As first written, `deployedStripeMode()` delegated to `isStripeTestMode()`, which
honours `STRIPE_WEBHOOK_MODE`. The guard therefore rested transitively on a variable
that has **no call site** outside `stripeWebhookSecrets.ts` and its tests, appears in
**no documentation**, and is **absent from `CONFIG_REQUIRED`**.

`deployedStripeMode()` now reads `STRIPE_SECRET_KEY` and nothing else. The key is the
credential the deployment actually holds, which makes it the one honest statement of
the mode it belongs to. `STRIPE_WEBHOOK_MODE` keeps its ordering role, where a wrong
answer costs one extra HMAC and nothing more.

It also **fails closed**: an unset or unrecognised key yields `'live'`, so a
deployment that cannot show it is a test deployment is held to live-mode events
rather than defaulting to the permissive side.

### Pinned at two levels

Re-coupling the guard to the override changed **no test** when first attempted
(mutation N7 survived). Added:

- unit: the override reorders candidates, but `deployedStripeMode()` still returns
  `live` under `STRIPE_WEBHOOK_MODE=test` with a live key
- unit: the authorized mode derives from the key (`sk_test_`, `rk_test_`, `sk_live_`)
- unit: fails closed to `live` with no key bound
- handler: a test-mode event is still refused on a live deployment under
  `STRIPE_WEBHOOK_MODE=test`
- handler: the complement — a live event is still **accepted** under that override,
  so ignoring it does not break the correct case

### Verdict and documentation

**Dead weight.** Ordering-only, no other call site, no docs, not in
`CONFIG_REQUIRED`, and neither reviewer could establish an intended operator use.
**Not documented in `config.ts`** — the constraint required documentation only if the
guard depended on it, and it no longer does. **Not deleted**, per instruction;
recommended for removal in a separate PR. Adding it to `.env.example` would
legitimize a variable that should probably go.

---

## 18. Item 25 — recorded only, not changed

The idempotency check degrades to "not processed" and continues on failure
(`src/webhooks/stripeWebhook.ts` ≈`:1084-1094` platform, ≈`:1313-1322` Connect). It is
deliberate and commented — better to process twice than to miss an event — but a
Firestore outage turns every Stripe retry into a duplicate write with **no distinct
alert**. Not expanded in this PR; tracked separately.

Relevant to Blocker 1: idempotency would not have contained a cross-mode event
anyway, because test and live `evt_` ids are separate namespaces.

---

## 19. Rotation — the story in the comment was false

The duplicated rationale cited "a rolled secret overlaps its replacement" as a
motivation for the candidate loop. That does not hold, and `c201962` corrects it.

Surviving an overlap window needs the **old and new secret of the same mode**
available at once. There is one env var per mode, so only one of the two can ever be
held; the second candidate is always the _other_ mode's secret, which the mode guard
refuses by design. **Rolling a signing secret today drops whatever is in flight
signed with the old one.**

What the loop does buy is that the machinery is ready: add a second same-mode var and
both candidates pass the guard, with no change to the module or the handlers. The
comment now says that explicitly, so nobody plans a rotation on its strength.

This also means the opposite-mode secret binding is, after the guard, **diagnostic
only** — it lets a cross-mode event be reported as "wrong mode" instead of an opaque
signature failure. It was kept for that reason, documented and asserted, rather than
silently unbound. Whether to keep binding it is a decision for a human (§21).

---

## 20. Mutation testing — 27 applied, 27 caught

Each mutation was applied to a single file, the full suite run, the file restored
byte-for-byte, and the tree re-verified at 854/854 green afterwards.

### Round 1 — Blockers 1 and 2, items 6, 12, 13

| #   | Mutation                                          | Caught by                                                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------------- |
| M1  | single-candidate revert (`candidates.slice(0,1)`) | 4 tests, incl. "tries every configured secret"                      |
| M2  | drop the whole mode gate                          | 7 tests                                                             |
| M3  | drop the **secret-mode** half only                | 2 tests — "livemode:true signed with the TEST secret"               |
| M4  | drop the **deployment-mode** half only            | 2 tests — "rejects a WRONG secret", "LIVE event on TEST deployment" |
| M5  | coerce a missing `livemode` to live               | 23 tests                                                            |
| M6  | keep only the LAST candidate error                | "preserves the FIRST candidate's error"                             |
| M7  | unbind `STRIPE_TEST_WEBHOOK_SECRET`               | "binds both platform signing secrets"                               |
| M8  | unbind `STRIPE_CONNECT_TEST_WEBHOOK_SECRET`       | "binds both Connect signing secrets"                                |
| M9  | tag every candidate with the deployment mode      | 4 tests                                                             |

M3 and M4 together are the proof that **both halves of the gate are load-bearing**.

### Round 2 — item 5

| #   | Mutation                                           | Caught by                          |
| --- | -------------------------------------------------- | ---------------------------------- |
| —   | revert `util/stripe.ts` to the literal             | runtime + source assertion         |
| —   | revert `api/stripe.ts`                             | runtime + source assertion         |
| —   | revert `scheduled/scheduledRentCollection.ts`      | runtime + source assertion         |
| —   | revert `scripts/migrateHouseSubscriptionStatus.ts` | source assertion only, as designed |

### Round 3 — items 17, 24, and the `STRIPE_WEBHOOK_MODE` constraint

| #   | Mutation                                          | Result                                                |
| --- | ------------------------------------------------- | ----------------------------------------------------- |
| N1  | drop `verifiedWith` from the platform success log | **initially SKIPPED** (ambiguous anchor), then CAUGHT |
| N1b | drop `verifiedWith` from the Connect success log  | CAUGHT                                                |
| N2  | success log back to `logger.debug`                | CAUGHT                                                |
| N3  | drop `candidatesTried` from the failure detail    | CAUGHT                                                |
| N4  | drop the mode detail from the gate rejection      | CAUGHT                                                |
| N5  | candidate-resolution log back to `logger.debug`   | CAUGHT                                                |
| N6  | log the secret **value** instead of its name      | CAUGHT by 2 tests                                     |
| N7  | guard reads `STRIPE_WEBHOOK_MODE` again           | **SURVIVED** → tests added → N7a CAUGHT               |
| N7b | guard delegates to `isStripeTestMode()`           | CAUGHT                                                |
| N7c | guard fails **open** to test on a missing key     | CAUGHT                                                |
| N8  | drop the API-version startup log                  | CAUGHT by 3 tests                                     |
| N9  | report an override as the pin                     | CAUGHT                                                |
| N10 | keep only the LAST candidate error                | CAUGHT                                                |

**N7 and N1 are the two that justify the exercise.** Both initially passed against a
broken implementation, and both are caught only because of the tests their survival
exposed as missing.

---

## 21. Needs a human

1. **Reconcile the Dashboard endpoint API versions with the pin.** One of the two
   registered endpoints carries api_version `2025-05-28.basil` while the service pins
   `2026-01-28.clover`. Inbound payload shape is a per-endpoint Dashboard setting and
   no code change can fix it — this is exactly the manual check
   `stripeApiVersion.ts` describes. Do this before the deploy.

2. **Decide whether to keep binding the opposite-mode secrets.** After the guard they
   are diagnostic only (§19). Kept, documented and asserted; unbinding them is a
   deliberate choice, not a cleanup.

3. **Remove `STRIPE_WEBHOOK_MODE` in a separate PR** (§17), or give it a documented
   purpose. It is currently ordering-only dead weight.

4. **`regroup/functions/.env.example` — no lines are required.** This work introduces
   no new environment variable. Specifically:
   - The four webhook signing secrets are Secret Manager secrets and must **not** go
     in any `.env` file — CLAUDE.md and `preflight-billing.js` both say so.
   - `STRIPE_API_VERSION` is already `CONFIG_REQUIRED[0]`, so it is already covered.
   - `STRIPE_WEBHOOK_MODE` should **not** be added; see item 3 above.

   The one optional, comment-only clarification, if an existing comment there
   describes mode behaviour:

   ```
   # Which Stripe mode's events a deployment will act on is derived from the bound
   # STRIPE_SECRET_KEY alone. A verified event from the other mode is refused with 400.
   # STRIPE_WEBHOOK_MODE (if present) only orders which signing secret is tried first.
   ```

   I could not read the file, so please check whether that is warranted rather than
   pasting it blind.

5. **Pre-push hook bug.** `.git/hooks/pre-push:7` sets
   `CACHE_FILE="$REPO_ROOT/.git/.test-passed"`, which fails in a worktree because
   `.git` is a **file** there, not a directory. The marker is a skip-cache read at
   `:10`, so the effect is that every worktree push re-runs the full suite instead of
   skipping. **Fail-safe** — it costs time, never skips tests, and `:40` is an
   unconditional `exit 0`, so it cannot block a push. Fix by resolving the real git
   dir, e.g. `CACHE_FILE="$(git rev-parse --git-common-dir)/.test-passed"`.

6. **`regroup/functions` has no `coverageThreshold`.** Not a defect against CLAUDE.md,
   which does not name it among the ratchets. But the four util files here are at
   100% and `stripeWebhook.ts` at 91%, so this is a cheap moment to establish a floor.

7. **`agent-gates/verify-diff.sh` is missing or not executable** — the pre-commit
   test-tamper gate was skipped on all eight commits.

---

## 22. Could not verify

1. **The `2026-07-29.dahlia` version number — the most important one.** It rests
   solely on Stripe's web changelog. Locally verifiable are only the _absence_ of
   `allowed_payment_method_types` from stripe@20.3.1 and the SDK default in
   `cjs/apiVersion.js`. The comments attribute it rather than assert it. It matters
   because it is the one number someone might act on when planning the SDK upgrade.

2. **The live Stripe account's webhook endpoints.** The CLI holds only the sandbox
   account `acct_1RXiFg2KPgAtfsl6`. The evidence for registered test-mode endpoints
   against production URLs comes from that sandbox account; the live account's
   configuration is unknown.

3. **Whether newer `firebase-tools` prompts interactively** on a missing bound secret
   rather than hard-failing. Not tested against the pinned CLI; marked UNVERIFIED in
   the code comment.

4. **`regroup/functions/.env.example` and `.env` contents** — both read-blocked by a
   deny rule throughout.

5. **Runtime behaviour of `main()` in `migrateHouseSubscriptionStatus.ts`** — not
   exported and gated behind `--verify-stripe`, so its Stripe client is covered by the
   source-level assertion only.

6. **Nothing was deployed**, so none of this is confirmed against a live Firebase
   runtime. In particular the module-load INFO line from §16 is verified by unit test,
   not by observing a cold start.

---

## 23. Verdict

**Safe to merge**, conditional on item 1 of §21.

The authorization hole is closed in both handlers and backed by tests that fail
against the broken implementation. The two gates that claimed to block now either
block or say they do not. The tautological assertion is replaced by one that
discriminates. Comment claims are either locally verified, attributed, or removed.

The condition is a configuration reconciliation, not a code change: the Dashboard
endpoint carrying api_version `2025-05-28.basil` should be aligned with the pin
before deploying, since no code in this PR can affect inbound payload shape. The
deploy itself is what arms the exposure described in §3, so that reconciliation and
this merge belong in the same window.
