# PR #12 Review — recovery-api app-id registry

**PR:** https://github.com/marcusk639/recovery-platform/pull/12
**Branch:** `feat/recovery-api-app-id-registry` → `main`
**Date:** 2026-06-10
**Scope reviewed:** `git diff origin/main...feat/recovery-api-app-id-registry`
**Files:** `recovery-api/src/config/apps.ts` (+`apps.test.ts`), `src/middleware/auth.ts` (+`auth.test.ts`), `src/callable/referrals.ts`, `src/entities/Referral.ts`, `src/entities/User.ts`, `env.example`, `package.json`

Review run via the multi-agent fleet: code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer. (comment-analyzer was not completed — stopped on session cost.)

> **Status:** No fixes applied. This document records findings only.

---

## 🔴 Critical

None. No auth bypass, no secret leak. Logic is sound; `tsc --noEmit` clean and 25 tests pass. Every previously-valid caller still authenticates (`sober-living` accepted as an alias → `phoenix-cleanhouse`); the only newly-accepted originator is `nextstep-recovery`, which is intentional and tested. `treatment-center` is correctly target-only (cannot authenticate).

---

## 🟠 Important

### 1. Non-string Phase 2 token claim → uncaught `TypeError` → opaque `internal` error

**Source:** silent-failure-hunter (HIGH) · **Files:** `apps.ts:80`, `auth.ts:52`

`resolveApp(value: string)` immediately calls `value.trim().toLowerCase()`. In the Phase 2 path the input is `request.auth.token['appId'] as string | undefined` — an unchecked cast of a client-influenceable JWT claim. A non-string `appId` claim (number/object/array) is truthy and non-string, so `resolveApp` throws `value.trim is not a function`. With no try/catch anywhere, this escapes as a generic Firebase `internal` 500 instead of the intended `unauthenticated` "Missing or invalid appId claim".

**Fix:**

```ts
export function resolveApp(value: unknown): AppRegistryEntry | undefined {
  if (typeof value !== "string") return undefined;
  return byKey.get(value.trim().toLowerCase());
}
```

Non-string claims then flow cleanly into the existing `if (!appId)` guard.

### 2. Data-migration regression for pre-existing referral docs

**Source:** code-reviewer (confidence 82) · **Files:** `referrals.ts:31-33,44-50,66`, `auth.ts`

Previously a caller sending `X-App-Id: sober-living` had `fromApp`/`referredByApp` stored verbatim as `"sober-living"`. Auth now normalizes to canonical `"phoenix-cleanhouse"` before storage. `handleGetReferrals` filters `where('referredByApp', '==', context.appId)` (now always canonical), and `handleGetReferral`'s ownership check compares against canonical too. Any **existing** docs with the legacy `sober-living` value will silently stop matching — they disappear from the owner's list and return `permission-denied` on direct fetch.

**Action:** Confirm the `referrals` collection is empty (likely, pre-launch) → non-issue. Otherwise backfill `sober-living` → `phoenix-cleanhouse`, and add a migration note to the PR.

### 3. Fragile `toApp` persistence (relies on object key order)

**Source:** silent-failure-hunter (MEDIUM) + type-design-analyzer · **File:** `referrals.ts:30-37`

```ts
const ref = await db.collection('referrals').add({
  ...parsed,   // includes parsed.toApp = raw wire value e.g. "Regroup"
  toApp,       // canonical — wins ONLY because it appears after the spread
  ...
});
```

Correct today purely by key ordering. A future reorder would silently re-store the raw, unnormalized wire value, violating the `Referral.toApp` canonical-app-id contract. `db.add()` is typed `any`, so the compiler won't catch it, and no test asserts the stored value.

**Fix:** destructure so the spread can't carry the raw field:

```ts
const { toApp: _rawToApp, ...rest } = parsed;
const ref = await db.collection('referrals').add({ ...rest, toApp, fromApp: context.appId, ... });
```

---

## 🟡 Suggestions

### 4. SSOT type drift between registry and hand-maintained unions

**Source:** type-design-analyzer (headline design note) · **Files:** `apps.ts:25`, `Referral.ts:6-7`, `User.ts:5`, `auth.ts:5`

The registry is meant to be the single source of truth, but four literal-union types are hand-maintained in parallel with nothing enforcing consistency:

- `ServiceAuthContext['appId']` (`auth.ts:5`)
- `Referral.fromApp`, `Referral.toApp` (`Referral.ts:6-7`)
- `User.appId` (`User.ts:5`)

`appId: string` on `AppRegistryEntry` is looser than its own consumers — a typo (`'homegroup'`) compiles. Adding a 5th app to `APP_REGISTRY` compiles, is accepted at runtime (`ORIGINATOR_APP_IDS` is data-derived), and gets persisted into a `fromApp` field whose type forbids it — with zero compiler feedback. The `as ServiceAuthContext['appId']` cast in `resolveOriginator` is unsound-but-currently-true (a boolean guard doesn't narrow `string` to the union).

**Fix (high-leverage, no runtime change):**

- `export const APP_REGISTRY = [ ... ] as const satisfies readonly AppRegistryEntry[];`
- Derive `type AppId = (typeof APP_REGISTRY)[number]['appId'];` and `OriginatorAppId` / `TargetAppId`.
- Point `Referral`/`User`/`ServiceAuthContext` at the derived types.
- Make `isOriginatorAppId(x): x is OriginatorAppId` a type guard → drops the unsound cast.

Minor related: `ORIGINATOR_APP_IDS`/`TARGET_APP_IDS` duplicate what `isOriginatorAppId`/`isTargetAppId` answer; two independent booleans admit a meaningless `{canOriginate:false, canReceive:false}` state; `byKey` silently last-writer-wins on key collisions (add a uniqueness test).

### 5. Test gaps at the integration layer

**Source:** pr-test-analyzer · **Files:** `referrals.test.ts` (not modified by PR), `auth.test.ts`

`apps.test.ts` is strong at the unit level, but the new integration behaviors are effectively untested:

- **(a) Stored `toApp` normalization — the PR's headline contract.** No test asserts that sending `toApp: 'Regroup'` / `'sober-living'` stores `'phoenix-cleanhouse'`. A regression dropping the `toApp` override would pass all tests.
- **(b) `invalid-argument` rejection of an unknown target.** The existing `referrals.test.ts` "throws on invalid toApp" sends `'unknown'` and only asserts `.rejects.toThrow()` (no `code`) — now passes for the wrong reason (registry gate vs old Zod enum).
- **(c) Auth rejection of a target-only app as originator.** No test sends `X-App-Id: 'treatment-center'` (or as a Phase 2 claim) and asserts `unauthenticated`. A regression dropping the `isOriginatorAppId` check would silently let `treatment-center` originate.

Suggested additions are 1–2 lines each given the registry design.

### 6. No `ZodError` → `HttpsError` boundary / error logging

**Source:** silent-failure-hunter (MEDIUM, pre-existing) · **Files:** `referrals.ts:24`, onCall wrappers

`CreateReferralSchema.parse()` throws raw `ZodError` and `db.add()` can reject — neither is caught, so they surface to clients as opaque `internal` rather than `invalid-argument`, with no server-side logging (project rule: log full error server-side, return sanitized message). The PR loosened `toApp` to `z.string().min(1).max(64)` (target validation correctly moved to `isTargetAppId`), which makes a wrapping boundary more relevant. Minor: Phase 1 (`X-App-Id must be one of: ...`) and Phase 2 (`Missing or invalid appId claim`) give different messages for the same resolution failure.

Error-message leakage check: `Unknown referral target: ${parsed.toApp}` echoes caller-supplied, Zod-bounded input (≤64 chars) — **not** a leak. `X-App-Id must be one of: ${ORIGINATOR_LIST}` enumerates semi-public app-ids only to callers past the service-key check — borderline vs the sanitization rule, not a regression. Both acceptable.

---

## ✅ Strengths

- No auth bypass; originator set preserved in spirit (`sober-living` still works via alias; only `nextstep-recovery` newly added, tested).
- Boundary normalization centralized and case/whitespace/alias-insensitive (`resolveApp` uses `.trim().toLowerCase()`, lookup map built once as `ReadonlyMap`).
- `toApp` validation correctly moved from Zod enum to runtime `resolveAppId` + `isTargetAppId`, preserving rejection of unknown targets while accepting display names/aliases.
- Entity union types now internally consistent with the registry; `treatment-center` correctly `canOriginate:false`.
- No swallowed errors, empty catches, or default-fallbacks; undefined cases handled explicitly with typed `HttpsError`.
- `apps.test.ts` is high-quality behavioral coverage (resolution, alias, casing/whitespace, unknown, originator/target gating).
- No secrets committed; `env.example` (`INTERNAL_API_KEY` → `RECOVERY_PLATFORM_API_KEY`) matches the actual `process.env` read; immutability respected.

---

## Recommended order to address

1. **#1** (resolveApp unknown-guard) — quick, prevents opaque 500s.
2. **#3** (destructure `toApp`) — quick, prevents silent data corruption.
3. **#2** (confirm `referrals` empty, else backfill) — confirm-or-migrate before merge.
4. **#5** (close the three integration test gaps).
5. **#4** (as-const / derived types / type-guard) — optional SSOT hardening, no runtime change.
6. **#6** (ZodError boundary + logging) — optional, pre-existing.

**Bottom line:** No blocking bugs. #1 and #3 are the worthwhile pre-merge code fixes; #2 is a data check; the rest are hardening.
