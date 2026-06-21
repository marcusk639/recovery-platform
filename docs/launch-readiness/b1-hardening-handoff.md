# B1 Hardening — Session Handoff

**Date:** 2026-06-20
**Branch:** `fix/p0-launch-blockers`
**Status:** ✅ DONE (validation shipped, commit `8318576`). Unauth-callable
sweep completed — no safe code change remains (see "Unauth callable sweep").
**Parent plan:** `docs/launch-readiness/speed-to-market-plan.md` (Track B1)

---

## Resolution (2026-06-20)

1. **`findMeetings` input validation — SHIPPED** (`8318576`). Added a
   zero-dependency `validateFindMeetingsInput` helper; replaced the raw cast;
   validation runs before the handler `try/catch` so `invalid-argument` is not
   rewrapped as `internal`. tsc clean; full Jest green (651 tests); 9 new tests;
   no dep/lockfile change; `SerializedMeeting` contract untouched. Code review:
   APPROVE, 0 CRITICAL / 0 HIGH.

2. **Unauth callable sweep — NO SAFE CODE CHANGE.** Enumerated all 94
   `onCall`/`onRequest` handlers. Seven lacked a `request.auth` literal:
   - `initiateAdminRemoval`, `voteOnAdminRemoval`, `submitAdminRemovalResponse`
     — **false positives**: authenticated via `const { auth: context } = request`
     - `throw unauthenticated`. No change needed.
   - `stripeWebhook` — Stripe signature-verified. No change needed.
   - `getPublicGroupProfile`, `submitPartnershipLead` — **intentionally public**
     and already input-validated + sanitized (the latter even has a honeypot,
     `kind` enum check, email regex, field truncation). The only residual
     mitigation is rate limiting (blocker doc #10: "once traffic justifies" —
     deferred) and App Check (blocker doc #13: ops-gated full client rollout,
     "do NOT flip the flag").
   - `googlePlacesProxy` — `onRequest({cors:true})`, intentionally unauth by
     design (a maps-library proxy that cannot attach a Firebase token);
     protected by server-side key. Adding auth would break the library.

   **Conclusion:** the "2 public unauth callables" are intentionally public and
   already hardened against malformed/abusive payloads. Remaining mitigations
   (App Check, per-IP rate limiting) are OPS-gated/explicitly deferred, matching
   the monetization audit's finding that launch blockers are ops-gated, not code.

> Investigation in the prior session **shrank B1's scope** from what the plan
> assumed. Read this before starting — two of the three assumed items are
> non-issues.

---

## What B1 was assumed to be (from the plan)

1. Add input validation to Homegroups `findMeetings` (raw cast → validated).
2. Lock down "2 public unauth callables" in Homegroups.
3. Fix the `notSpamming()` no-op.

## What investigation actually found (ground truth)

1. ✅ **VALID — the one real task.** `homegroups/functions/src/callable/findMeetings.ts`
   does `const meetingInput = request.data as MeetingSearchInput;` — a **raw cast
   with no validation**. Malformed input flows straight into the handler. Regroup
   validates the identical shape with zod + a `parseInput` helper
   (`regroup/functions/src/callable/meetings.ts`, `findMeetingsSchema`).
2. ❌ **NON-ISSUE.** `findMeetings` is **already authenticated** — its handler opens
   with `if (!request.auth) { throw new HttpsError("unauthenticated", ...); }`. It is
   NOT a public unauth callable. The "2 public unauth callables" (if they still
   exist) are **elsewhere** and were never identified — see "Remaining investigation".
3. ❌ **NON-ISSUE in this package.** `notSpamming()` does **not exist** anywhere in
   `homegroups/functions/src`. The launch-doc reference is stale or points at the
   mobile package. Nothing to fix in functions.

---

## The single change to implement (B1, scoped)

Add input validation to `homegroups/functions/src/callable/findMeetings.ts`.

**Decision (recommended): zero-dependency validator.** `zod` is **NOT** installed
in `homegroups/functions` (it IS in `regroup/functions`). Adding it means an
npm install + `package-lock.json` change in a functions package — avoid for
speed-to-market. Instead write a small typed `validateFindMeetingsInput(data)`
that:

- Requires `filters.location.lat` and `filters.location.lng` to be finite numbers.
- Validates `filters.type` against the existing `MeetingTypeFilters` union
  (`"AA" | "NA" | "AL-ANON" | "Religious" | "Custom" | "all" | "Celebrate Recovery"`);
  default to `"all"` if absent.
- Treats `filters.day` and `criteria` as optional, type-checked if present.
- Throws `new HttpsError("invalid-argument", "<clear message>")` on failure
  (consistent with the existing error style in the file).

Insert the validation call **immediately after the existing `request.auth` check**,
replacing the raw `request.data as MeetingSearchInput` cast with the validated
result.

**Acceptance:**

- `cd homegroups/functions && npx tsc --noEmit` passes.
- Existing Jest suite passes (`npm test` in `homegroups/functions`).
- Add/extend a unit test: malformed input (missing `location`, bad `type`) →
  `invalid-argument`; valid input → passes through unchanged.
- No `package.json` / lockfile change.

**Anti-patterns to avoid:**

- Do NOT add zod to homegroups just for this (dependency churn; consolidation in
  Track B will centralize validation in recovery-api anyway).
- Do NOT change the `SerializedMeeting[]` client contract — mobile/web depend on it.

---

## Remaining investigation (separate, do NOT bundle into B1)

The "2 public unauth callables" item is real per `homegroups/docs/LAUNCH_BLOCKERS.md`
#8 but the specific callables were never identified this session. Fresh-session
discovery step:

```bash
cd homegroups/functions
# find onCall/onRequest handlers and check which skip a request.auth / token check
grep -rn "onCall\|onRequest" src/ | grep -v "\.test\."
# then inspect each for a missing `if (!request.auth)` guard
```

Decide gating per callable (require auth, App Check, or rate limit). Track this as
its own item — keep B1 to the single validation change above.

---

## Key file references (verified 2026-06-20)

- Target: `homegroups/functions/src/callable/findMeetings.ts`
  - auth guard + raw cast: in the `export const findMeetings = onCall(...)` handler
  - input type: `interface MeetingSearchInput` (top of file)
  - filter union: `export type MeetingTypeFilters`
- Pattern to mirror (zod, for reference only — do not copy the dep):
  `regroup/functions/src/callable/meetings.ts` (`findMeetingsSchema`, `parseInput`)
- Plan parent: `docs/launch-readiness/speed-to-market-plan.md`
