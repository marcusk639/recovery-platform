# Homegroups Code-Automatable Launch Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the small set of genuinely code-automatable items from the broader Homegroups launch plan (`docs/plans/2026-07-06-homegroups-launch-plan.md`) — everything else in that plan (Stripe Dashboard config, Firebase Console settings, App Store submission, live-card E2E testing, meeting attendance) requires a human with live credentials/accounts and is intentionally out of scope here.

**Architecture:** No new services or architecture. Task 1 is a verification pass against existing Cloud Functions and mobile TypeScript. Task 2 adds a small Firestore-backed rate limiter utility and wires it into one existing callable. Task 3 is a one-line cosmetic rename.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript, Node 22, `firebase-admin` ^13.10.0, `firebase-functions` ^7.2.5), Jest + `ts-jest` for functions tests, React Native 0.72 mobile app.

## Global Constraints

- All paths below are relative to `/Users/marcusklein/dev/recovery-platform/homegroups/`.
- No new npm dependencies. The codebase has no rate-limiting package installed (confirmed: no `firebase-functions-rate-limiter`, `express-rate-limit`, or similar in `functions/package.json`) — build the rate limiter from `firebase-admin`'s existing Firestore transaction API, not a new dependency.
- Client-facing errors use `HttpsError` from `firebase-functions/v2/https`, matching every existing callable in `functions/src/callable/`.
- No PII in logs or error messages (root `CLAUDE.md` cross-cutting rule).
- Follow the existing test-mocking convention exactly: declare mock `jest.fn()` instances at module scope, reference them from a `jest.mock(...)` factory, and never rely on dynamically-imported modules to share a fresh mock instance across `jest.resetModules()` boundaries (see `functions/src/__tests__/getPublicGroupProfile.test.ts` for the pattern already in use).
- Do not touch native Xcode (`.xcodeproj`, `.xcworkspace`) or Android (`applicationId`, `namespace`) project identifiers — those are a much larger native-rename operation and explicitly out of scope.
- Explicitly **excluded from this plan** (do not implement):
  - **Native version-number bumps.** iOS `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 1` and Android `versionName "1.0"` / `versionCode 1` are appropriate defaults for a not-yet-submitted first release — not a bug to fix.
  - **App Check rollout.** Requires registering attestation providers (Play Integrity, App Attest/DeviceCheck, reCAPTCHA) in the Firebase Console and a phased production-traffic monitoring period before enforcement — not a single code change. Tracked separately as `HG-P2-1` in `homegroups/docs/go-to-market/project-management.md`.

---

## File Structure

| File                                                             | Responsibility                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/utils/rateLimit.ts` (new)                         | `enforceRateLimit(key)` — Firestore-backed fixed-window rate limiter; `callerKey(request)` — derives a per-caller identifier from the raw HTTP request for unauthenticated callables. |
| `functions/src/utils/__tests__/rateLimit.test.ts` (new)          | Unit tests for both exports above.                                                                                                                                                    |
| `functions/src/callable/getPublicGroupProfile.ts` (modify)       | Calls `enforceRateLimit` at the top of the handler, before any Firestore reads.                                                                                                       |
| `functions/src/__tests__/getPublicGroupProfile.test.ts` (modify) | Mocks the new rate-limit module (no-op for existing tests) and adds one test confirming a rate-limited caller is rejected before any group lookup.                                    |
| `mobile/package.json` (modify)                                   | `name` field only: `RecoveryConnect` → `homegroups`.                                                                                                                                  |

---

## Task 1: CI / Local Build Health Re-Baseline

**Files:** none created or modified — this is a verification pass. If a command below fails, do not attempt a speculative fix; stop and report `BLOCKED` with the exact command and full output, per the "Handling Implementer Status" contract in `superpowers:subagent-driven-development`. The root CI workflow (`.github/workflows/ci.yml`, `homegroups-functions` job) has zero confirmed-green runs on record — this task exists to get a first real signal before Task 2 adds new code on top of an unverified baseline.

**Context:** No TDD red/green cycle applies here — there is no new code to write. Each step is a command with an exact expected result.

- [ ] **Step 1: Install functions dependencies cleanly**

Run: `cd homegroups/functions && npm ci`
Expected: exits 0, no `ECONNRESET` or other network/install error. If it fails, retry once (transient registry errors happen); if it fails twice, report `BLOCKED` with the full error output — do not modify `package-lock.json` to work around it.

- [ ] **Step 2: Typecheck functions**

Run: `cd homegroups/functions && npx tsc --noEmit`
Expected: exits 0, no output.

- [ ] **Step 3: Run functions test suite**

Run: `cd homegroups/functions && npm test -- --passWithNoTests --forceExit`
Expected: exits 0, all suites pass (this mirrors the CI job's own command at `.github/workflows/ci.yml:44-45` exactly).

- [ ] **Step 4: Install mobile dependencies cleanly**

Run: `cd homegroups/mobile && npm ci`
Expected: exits 0. In a fresh worktree, `node_modules` does not exist yet — without this step, `npx tsc` silently resolves to npm's placeholder stub instead of the real TypeScript compiler and produces a misleading failure. If it fails, retry once; if it fails twice, report `BLOCKED` with the full error output.

- [ ] **Step 5: Typecheck mobile**

Run: `cd homegroups/mobile && npx tsc --noEmit`
Expected: exits 0, no output.

- [ ] **Step 6: Report**

If Steps 1–5 all passed: report `DONE` with the five command outputs (or "clean, no output" where applicable) as the verification evidence. No commit is needed — nothing changed.

If any step failed: do NOT attempt to fix it as part of this task. Report `BLOCKED`, quoting the failing command and its full output verbatim, so the controller can decide whether it's a real regression or a flake worth re-running.

---

## Task 2: Rate Limit `getPublicGroupProfile`

**Files:**

- Create: `functions/src/utils/rateLimit.ts`
- Test: `functions/src/utils/__tests__/rateLimit.test.ts`
- Modify: `functions/src/callable/getPublicGroupProfile.ts`
- Modify: `functions/src/__tests__/getPublicGroupProfile.test.ts`

**Interfaces:**

- Produces: `enforceRateLimit(key: string): Promise<void>` — resolves normally under the threshold; rejects with `new HttpsError("resource-exhausted", "Too many requests. Please try again shortly.")` once the caller has made 30 or more calls with the same `key` within a 60-second window.
- Produces: `callerKey(request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string` — returns the first `X-Forwarded-For` entry if present, else `request.rawRequest?.ip`, else the literal string `"unknown"`.
- Consumes (in `getPublicGroupProfile.ts`): both of the above, imported from `../utils/rateLimit`.

### Step 1: Write the failing tests for `rateLimit.ts`

Create `functions/src/utils/__tests__/rateLimit.test.ts`:

```typescript
export {}; // Ensure isolated module

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn(() => ({}));
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockGet, set: mockSet }),
);
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("../firebase", () => ({
  db: {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  },
}));

import { enforceRateLimit, callerKey } from "../rateLimit";

function snap(data: any, exists = true) {
  return { exists, data: () => data };
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: any) =>
      fn({ get: mockGet, set: mockSet }),
    );
  });

  it("allows the first request in a new window", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 }),
    );
  });

  it("allows requests under the threshold within the window", async () => {
    const now = Date.now();
    mockGet.mockResolvedValueOnce(snap({ windowStart: now, count: 5 }));
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 6 }),
    );
  });

  it("throws resource-exhausted once the threshold is reached within the window", async () => {
    const now = Date.now();
    mockGet.mockResolvedValueOnce(snap({ windowStart: now, count: 30 }));
    await expect(enforceRateLimit("test-key")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("resets the count once the window has expired", async () => {
    const staleWindowStart = Date.now() - 61_000; // just past the 60s window
    mockGet.mockResolvedValueOnce(
      snap({ windowStart: staleWindowStart, count: 30 }),
    );
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 }),
    );
  });
});

describe("callerKey", () => {
  it("prefers the first X-Forwarded-For entry", () => {
    const key = callerKey({
      rawRequest: {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        ip: "9.9.9.9",
      },
    } as any);
    expect(key).toBe("1.2.3.4");
  });

  it("falls back to rawRequest.ip when no X-Forwarded-For header is present", () => {
    const key = callerKey({ rawRequest: { ip: "9.9.9.9" } } as any);
    expect(key).toBe("9.9.9.9");
  });

  it('falls back to "unknown" when neither is present', () => {
    const key = callerKey({ rawRequest: {} } as any);
    expect(key).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the new test file to verify it fails**

Run: `cd homegroups/functions && npx jest src/utils/__tests__/rateLimit.test.ts`
Expected: FAIL — `Cannot find module '../rateLimit'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `rateLimit.ts`**

Create `functions/src/utils/rateLimit.ts`:

```typescript
import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebase";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

/**
 * Firestore-backed fixed-window rate limiter. An in-memory counter is not
 * safe here — Cloud Functions instances are not guaranteed to be reused
 * between calls, so state must live outside the process.
 *
 * Throws HttpsError("resource-exhausted") once `key` has been passed
 * MAX_REQUESTS_PER_WINDOW times within the current WINDOW_MS window.
 */
export async function enforceRateLimit(key: string): Promise<void> {
  const ref = db.collection("_rateLimits").doc(key);
  const now = Date.now();

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : undefined;
    const windowStart: number | undefined = data?.windowStart;
    const count: number = data?.count ?? 0;

    if (windowStart === undefined || now - windowStart >= WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }

    if (count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again shortly.",
      );
    }

    tx.set(ref, { windowStart, count: count + 1 });
  });
}

interface CallerRequest {
  rawRequest?: {
    ip?: string;
    headers?: Record<string, unknown>;
  };
}

/** Derives a per-caller identifier for rate-limiting unauthenticated callables. */
export function callerKey(request: CallerRequest): string {
  const xff = request.rawRequest?.headers?.["x-forwarded-for"];
  const forwarded =
    typeof xff === "string" ? xff.split(",")[0].trim() : undefined;
  return forwarded || request.rawRequest?.ip || "unknown";
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `cd homegroups/functions && npx jest src/utils/__tests__/rateLimit.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire the rate limiter into `getPublicGroupProfile.ts`**

In `functions/src/callable/getPublicGroupProfile.ts`, add the import after the existing `db` import (currently line 6):

```typescript
import { enforceRateLimit, callerKey } from "../utils/rateLimit";
```

Then change the top of `getPublicGroupProfileHandler` (currently lines 43-46) from:

```typescript
async function getPublicGroupProfileHandler(
  request: CallableRequest<GetPublicGroupProfileData>,
): Promise<PublicGroupProfile> {
  const { groupId } = request.data || ({} as GetPublicGroupProfileData);
```

to:

```typescript
async function getPublicGroupProfileHandler(
  request: CallableRequest<GetPublicGroupProfileData>,
): Promise<PublicGroupProfile> {
  await enforceRateLimit(`getPublicGroupProfile:${callerKey(request)}`);

  const { groupId } = request.data || ({} as GetPublicGroupProfileData);
```

- [ ] **Step 6: Update the existing test file's mocks so current tests keep passing**

In `functions/src/__tests__/getPublicGroupProfile.test.ts`, add the following near the top, alongside the existing `jest.mock` calls (before the `db` mock at line 56 is fine — order among `jest.mock` calls in the same file doesn't matter, Jest hoists them all):

```typescript
const mockEnforceRateLimit = jest.fn().mockResolvedValue(undefined);
const mockCallerKey = jest.fn().mockReturnValue("test-ip");
jest.mock("../utils/rateLimit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
  callerKey: mockCallerKey,
}));
```

Then add one new test inside the `describe("getPublicGroupProfile", ...)` block (after the existing `"skips fallback query..."` test, i.e. as the last test in the block):

```typescript
it("propagates resource-exhausted when the caller has been rate limited, without touching Firestore", async () => {
  mockEnforceRateLimit.mockRejectedValueOnce({
    code: "resource-exhausted",
    message: "Too many requests. Please try again shortly.",
  });
  const { getPublicGroupProfile: fn } =
    await import("../callable/getPublicGroupProfile");
  await expect(
    (fn as any)(makeRequest({ groupId: "group-1" })),
  ).rejects.toMatchObject({ code: "resource-exhausted" });
  expect(mockGroupGet).not.toHaveBeenCalled();
});
```

- [ ] **Step 7: Run both test files to verify everything passes**

Run: `cd homegroups/functions && npx jest src/utils/__tests__/rateLimit.test.ts src/__tests__/getPublicGroupProfile.test.ts`
Expected: PASS, all tests in both files (7 + 10 = 17 tests total: the 9 pre-existing `getPublicGroupProfile` tests plus the 1 new one).

- [ ] **Step 8: Typecheck and run the full functions suite**

Run: `cd homegroups/functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
cd homegroups/functions
git add src/utils/rateLimit.ts src/utils/__tests__/rateLimit.test.ts src/callable/getPublicGroupProfile.ts src/__tests__/getPublicGroupProfile.test.ts
git commit -m "feat(homegroups-functions): add per-caller rate limiting to getPublicGroupProfile"
```

---

## Task 3: Rename `mobile/package.json` to Match Current Branding

**Files:**

- Modify: `mobile/package.json`

**Interfaces:** none — this changes only an npm package metadata field, not a runtime-consumed value. Confirmed by a full-repo grep: nothing reads `package.json`'s `name` field at runtime (`AppRegistry` uses `app.json`'s `name`, which is a separate file and is intentionally left untouched here since changing it affects native bootstrap and is a much larger operation); Detox's binary paths and the native Xcode scheme reference the Xcode project's own `PRODUCT_NAME` (`RecoveryConnect`), not this field.

- [ ] **Step 1: Change the `name` field**

In `mobile/package.json`, change line 2 from:

```json
  "name": "RecoveryConnect",
```

to:

```json
  "name": "homegroups",
```

- [ ] **Step 2: Verify nothing else in the repo reads this field**

Run: `cd homegroups/mobile && grep -rn "require(.*package.json.*)\.name\|package\.json.*name" src/ App.tsx 2>/dev/null`
Expected: no output (confirms no runtime code reads `package.json`'s `name` field — this was already verified during plan research, this step re-confirms against the current tree before committing).

- [ ] **Step 3: Confirm the app still typechecks and lints clean**

Run: `cd homegroups/mobile && npx tsc --noEmit`
Expected: exits 0 (renaming a `package.json` field cannot break TypeScript, but this confirms the file is still valid JSON and nothing downstream broke).

- [ ] **Step 4: Commit**

```bash
cd homegroups/mobile
git add package.json
git commit -m "chore(homegroups-mobile): rename package.json to match Homegroups branding"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the CI-health verification identified as a new risk during research. Task 2 covers `HG-P2-2` (rate limiting on `getPublicGroupProfile`) from `homegroups/docs/go-to-market/project-management.md`. Task 3 covers the cosmetic branding inconsistency noted in the original launch-readiness doc (§4.1). App Check (`HG-P2-1`) and native version bumps are explicitly excluded per Global Constraints, with rationale.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" language present; every step has literal commands or literal code.
- **Type consistency:** `enforceRateLimit(key: string): Promise<void>` and `callerKey(request): string` signatures are identical everywhere they're referenced (definition in Task 2 Step 3, consumption in Task 2 Step 5, mock in Task 2 Step 6).
