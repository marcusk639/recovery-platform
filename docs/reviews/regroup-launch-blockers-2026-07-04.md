# Regroup Launch-Readiness Punch List

**Date:** 2026-07-04
**Purpose:** Pull every regroup-specific finding from `docs/reviews/codebase-review-2026-07-03-full-platform-read.md` into one prioritized, status-checked list — what must be fixed before launch vs. what can wait — and confirm (against current source, not the 1-day-old review) whether each is still open.
**Method:** Every item below was re-verified against current source on `test/e2e-launch-prep` today, not assumed from yesterday's review. Original finding numbers (`#N`) are preserved for cross-reference.

---

## Tier 1 — Launch blockers (fix before shipping)

These have a plausible path to real user harm (data leakage, wrong data written, broken core flow) and were all **confirmed still open** on today's source.

### 1. `CreateGuestForm` hardcodes a real house ID onto every new resident (#31)

**FIXED 2026-07-04** — `regroup/mobile/src/screens/CreateGuest/CreateGuestForm.tsx:21` was `values.houseId = 'oReUMPURqJqBAn3sNOjP';`, silently assigning every new guest to one specific house regardless of which house the operator actually selected. Fixed by threading the real `houseId` from `useSelectedHouse()` (already imported in this file, already used to scope the guest list — just never forwarded into the submitted values) down through a new `houseId` prop on `CreateGuestFormWrapper` → `CreateGuestForm`, and adding a guard that fails the submission with `setStatus({ failed: true })` rather than silently proceeding if no house is selected. **Status: fixed, needs manual verification** — automated verification isn't currently possible because regroup/mobile's Jest/Babel config is entirely missing from the repo (confirmed by attempting to run the existing `CreateGuest.test.tsx`, which fails at the parse stage before any test logic runs — this is the same gap tracked in `docs/plans/2026-07-03-comprehensive-test-suite-plan.md` Phase 1). **Use §2 of `regroup-manual-qa-plan-2026-07-04.md` to verify this fix by hand** until that test infra is restored.

### 2. Live production credential — RESOLVED 2026-07-04 (#27)

**Closed.** All 5 `*@rats-e2e.com` accounts (including `test-manager@rats-e2e.com`, which carried an `admin` claim) were deleted from `phoenix-cleanhouse` Firebase Auth using `regroup/mobile/scripts/delete-e2e-prod-accounts.ts`, then independently re-verified by re-running the script's dry-run mode — all 5 emails now return `not-found` against production. The exposed `TestPassword123!` no longer unlocks anything real. E2E continues to run emulator-only via `reset-and-seed.sh`; the prod-writer script that originally created these accounts was lost in a machine change and was deliberately not recreated, so there's no remaining code path that provisions test personas in production. No further action needed on this item.

### 3. `SignUpWebView` has no origin validation on its `onMessage` handler (#28)

**Still open** — confirmed at `regroup/mobile/src/screens/SignUp/SignUpWebView.tsx:29-42`: `handleEvent` parses `event.nativeEvent.data` with no check on which origin sent it, and dispatches a real `login()` action with whatever `{email, password}` the loaded page provides. There's also no `try/catch` around the `JSON.parse` — a malformed message from any loaded page (or a compromised/spoofed one) can crash the screen, and a well-formed one can inject arbitrary login credentials. The sibling `PaymentWebView` component already has the right pattern (origin allowlist, fails closed) — apply the same pattern here.

### 4. `SubscriptionHandler` injects the full serialized `User` object into a WebView (#29)

**Still open** — confirmed at `regroup/mobile/src/screens/SubscriptionHandler/SubscriptionHandler.tsx:38`: `window.user = ${JSON.stringify(user)}`. No field allowlisting — this exposes the entire user record to the third-party web origin and anything running in it. Fix: serialize only the specific fields the web page actually needs (likely just a user ID or a short-lived token), not the whole object.

### 5. Guest-removal callable name mismatch (dead-code audit, §7 of `dead-code-audit-2026-07-04.md`)

**FIXED today** — `regroup/mobile/src/services/house.tsx` was calling a callable name (`removeAdminPrivilegesForGuests`) that doesn't exist on the backend; the real function is `removePrivilegesForGuests`. Client call renamed to match. **Needs emulator/manual verification** — see the QA plan.

### 6. Oxford House "anonymous" voting is not actually anonymous (#30)

**Still open** — confirmed at `firestore.rules:191`, the `votes/{voteId}` subcollection has no field-level scoping on `individualVotes`; any house member can read every other member's vote via `isGuestOrAdmin`. This is a self-governance feature inside a recovery-support product claiming anonymity it doesn't provide — worth treating as a trust issue, not just a rules nit. Needs either a schema change (per-voter subcollection with admin-only read) or dropping the anonymity claim from the UI until the data model actually supports it.

### 7. `EnhancedAuthService` (rate-limiting, input sanitization) is built but not wired into the live login flow (#51)

**Still open** — confirmed: `EnhancedAuthService.ts` has zero references outside its own file and its tests. The live Redux `login`/`autoLogin` path uses the older, unhardened `services/users.tsx` + `userSlice`. This means real users today get none of the 5-attempt sign-in / 3-attempt password-reset rate limiting that already exists in the codebase — an easy brute-force/credential-stuffing surface on a product handling PII for a vulnerable population. This is the dead-code audit's top REUSE recommendation for the same reason it's a launch blocker here: the fix (wire the existing service in) is mostly integration work, not new development.

---

## Tier 2 — Should fix before launch, lower urgency than Tier 1

Real bugs with real but more contained impact — data can be wrong or a flow can silently fail, but there's no credential/PII exposure vector.

- **#34 — `houses` delete rule is dead code that always fails.** `firestore.rules:167`: `allow delete: if isHouseAdmin(request.resource.data.id)` — `request.resource.data` is always `null` on a delete, so this condition can never be true. Not a security hole (fails closed), but house deletion silently doesn't work from the client at all today; anyone needing to delete a house needs the Admin SDK. Confirm whether "delete a house" is a flow the launch actually needs — if yes, fix the rule to reference `resource.data.id` (the existing document) instead.
- **#53 — Two divergent EES (Equal Expense Share) data models write to the same Firestore collection.** `oxford/index.ts` writes an `EESTransaction` shape, `oxford/ees.ts` writes a different `EESRecord` shape, into the same `ees-records` collection. Confirmed still both live in the dead-code audit (§3 of `dead-code-audit-2026-07-04.md`) — this isn't dead code, it's a live schema conflict. Any code reading `ees-records` has to handle two incompatible shapes, or is silently only handling one of them correctly.
- **#37 — `AssignGuest.tsx` shows "Bed Assigned" success without awaiting the actual write.** A rejected assignment still displays as successful.
- **#38 — `OrgSetup.tsx` swallows house-creation errors** (empty `catch { // continue }`) and still navigates forward as if it succeeded — during operator onboarding specifically, this is a first-impression bug.
- **#42 — `IntroHouseSummary.tsx`'s "Certified" badge is `Math.round(Math.random())`** — literally random placeholder logic shipped to a screen real operators will see. Its "Apply" button is also permanently stubbed.
- **#43 — `NewMeeting.tsx`'s meeting-type picker is dead UI** — whatever the user picks, `handleSubmit` hardcodes `type = 'Custom'`.
- **#45 — `Voting.tsx` ignores the per-vote `threshold` field**, hardcoding 80% for every vote regardless of what was configured — combine with the anonymity issue above, voting is broadly under-trustworthy right now and may deserve a dedicated pass before launch rather than piecemeal fixes.
- **#48 — Deep-link scheme mismatch** (`regroup://` vs `regroup-app://`) — links minted one way may not be caught by the other; also flagged that `linking.ts` may never be wired into `NavigationContainer` at all ("Phase 6.4: Configuration ready for implementation" comment).
- **#49 — `InitialLandingForm`'s demo-login link is broken** (dead `showDemo()` function, link silently routes to plain Login instead) — low harm, but a broken demo path is a bad first impression for prospective operators evaluating the product.

## Tier 3 — Real, but can wait past launch

Architecture/drift-risk and minor findings that won't cause user-visible harm on their own but will keep generating confusing bugs over time: the client-side duplication of backend business rules (#58 — officer term length, meeting quorum, pricing display), the three coexisting "get current house" access patterns (#57), the inconsistent week-start anchor (#54), the disabled Yup validation on PII-collecting forms (#56), and everything in the original review's "Minor / cleanup" section (#61–69, several of which are now resolved or reclassified by the dead-code audit — e.g. the HOCs in #61 are covered in more depth in `dead-code-audit-2026-07-04.md` §4).

---

## Cross-reference: what changed since yesterday's review

- Four items from the original review are **already addressed** as of today: the `CreateGuestForm` hardcoded house ID (Tier 1 #1, fixed — the single highest-priority item in this document), the live production credential exposure (Tier 1 #2, resolved — accounts deleted and independently re-verified), the guest-removal callable mismatch (Tier 1 #5, fixed), and a false-positive "missing `searchForHouses` callable" claim from the dead-code audit's Wave 2 pass (investigated, was never actually broken — see the dead-code report's §7).
- Everything else flagged in the original review as a regroup security/data-integrity finding was **re-confirmed still present** today via direct source inspection, not re-assumed from the prior document. Nothing has silently regressed further or been coincidentally fixed by other work in progress.

## Suggested order of operations

1. ~~Tier 1, items 1–2~~ **Done** (hardcoded house ID fixed; credential exposure resolved and re-verified).
2. Tier 1, items 3–4 together (both are the same class of WebView-hardening fix, and `PaymentWebView` is the reference pattern for both).
3. Tier 1, item 6 (voting anonymity) — needs a product decision (real anonymity vs. honest UI) before an engineering fix, so start that conversation now even if the fix lands later.
4. Tier 1, item 7 (wire in `EnhancedAuthService`) — this is integration work against code that already exists and is already tested; likely the fastest of the Tier 1 items to actually ship.
5. Tier 2 items as time allows before launch; Tier 3 is a post-launch backlog.
