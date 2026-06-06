> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Consolidate Scheduled Weekly Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the 5 timezone-specific weekly transfer scheduled functions (`scheduledWeeklyTransferEST`, `-CST`, `-MST`, `-PST`, `-Fallback`) into a single `weeklyTransfers` scheduled function, reducing Cloud Run quota draw by 4 functions while preserving correctness.

**Architecture:** Replace 5 separate `onSchedule()` exports with one unified `onSchedule()` that fires once a week and internally iterates the full set of supported timezones (plus the "no timezone" fallback), calling the existing `transferStats` helper for each. The per-timezone business logic is unchanged — only the scheduler topology changes.

**Tech Stack:** `firebase-functions/v2/scheduler` (`onSchedule`), TypeScript, Jest, existing `transferStats` helper in `src/util/guest.ts`.

---

## Context & Background

### Why this phase first

The `phoenix-cleanhouse` project is under a Cloud Run "Total CPU allocation" quota of 20,000 milli-vCPU in `us-central1`. Each deployed v2 function draws quota as `maxInstances × cpu`. The backend currently has ~52 functions, forcing global settings of `cpu: 0.167, maxInstances: 2` just to fit. Consolidating unnecessary function exports reclaims quota headroom immediately and reduces the blast radius of future migrations.

The 5 weekly-transfer schedulers are the cleanest consolidation target because:

1. They share identical business logic (call `transferStats(null, <tz>)`).
2. They have no public API contract (no external caller references their function names).
3. They differ only in the `timeZone` field of `onSchedule`, making them trivially collapsible.

### Trade-off: week-boundary timing

Currently each timezone's week rolls at local-midnight Sunday. The consolidated function will roll _all_ timezones at a single UTC moment (5am UTC Sunday, chosen so that all North American timezones have already crossed their local midnight). This is acceptable because:

- `transferStats` filters houses by the `timezone` column in Firestore, so the correct houses are still processed.
- Week-to-week data retention is based on the `currentWeek`/`previousWeek` fields on each guest, not on the exact clock moment.
- The guest data seen by mobile app users on Sunday will already reflect the new week — from their perspective, the roll happened overnight.

If stakeholder review rejects the timing change, the alternative is manual Cloud Scheduler jobs (outside `onSchedule`) pointing at a single HTTP function with 5 separate cron entries. That is deliberately **out of scope** for this plan.

### Follow-up plans (not this plan)

This plan is Phase 1 of a broader consolidation effort. The following are tracked as separate, future plans:

- **Phase 2: Merge Firestore triggers on the same collection** (`addDeleteGuestAuthorization` + `eesRecalculationOnGuestWrite` both watch `/houses/{houseId}/guests/{guestId}` and can become one `onDocumentWritten`).
- **Phase 3: Introduce unified `rpc` callable dispatcher** — collapses 30 callable functions into 1, but requires coordinated mobile-client updates.

Do not expand this plan to cover them.

---

## File Structure

```
functions/
├── src/
│   ├── scheduled/
│   │   ├── index.ts                # MODIFIED — remove 5 exports, add 1
│   │   └── officerTermReminder.ts  # untouched
│   ├── util/
│   │   ├── guest.ts                # untouched (transferStats helper)
│   │   └── timezones.ts            # NEW — central list of supported timezones
│   └── __tests__/
│       ├── scheduled/
│       │   └── weeklyTransfers.test.ts  # NEW — tests for consolidated function
│       └── util/
│           └── timezones.test.ts        # NEW — tests for timezone list
```

**Responsibilities:**

- `src/util/timezones.ts` — single source of truth for the set of timezones that weekly transfers iterate. Exposes a readonly array and a type.
- `src/scheduled/index.ts` — exports `weeklyTransfers` (new) and continues to export `updateDisputes`, `warmWebsite`, `officerTermReminder` unchanged.
- Tests live beside existing test conventions (`src/__tests__/`).

---

## Task 1: Extract timezone list into a shared module

**Files:**

- Create: `functions/src/util/timezones.ts`
- Create: `functions/src/__tests__/util/timezones.test.ts`

- [ ] **Step 1: Write the failing test**

Create `functions/src/__tests__/util/timezones.test.ts`:

```typescript
import {
  WEEKLY_TRANSFER_TIMEZONES,
  FALLBACK_TIMEZONE,
  SupportedTimezone,
} from "../../util/timezones";

describe("timezones", () => {
  it("includes all four North American timezones used today", () => {
    expect(WEEKLY_TRANSFER_TIMEZONES).toEqual(
      expect.arrayContaining([
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
      ]),
    );
  });

  it("exports exactly four supported timezones (fallback is separate)", () => {
    expect(WEEKLY_TRANSFER_TIMEZONES).toHaveLength(4);
  });

  it("uses null to represent the fallback (houses with no tz set)", () => {
    expect(FALLBACK_TIMEZONE).toBeNull();
  });

  it("types are exported", () => {
    const tz: SupportedTimezone = "America/New_York";
    expect(tz).toBe("America/New_York");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test src/__tests__/util/timezones.test.ts`
(Or `cd functions && npx jest src/__tests__/util/timezones.test.ts` if not using pnpm workspace.)
Expected: FAIL with "Cannot find module '../../util/timezones'".

- [ ] **Step 3: Write minimal implementation**

Create `functions/src/util/timezones.ts`:

```typescript
/**
 * Central registry of timezones processed by the weekly transfer scheduler.
 *
 * Houses in Firestore store their IANA timezone string in the `timezone`
 * column. Adding a new timezone here causes it to be processed on the next
 * weekly run — no scheduler redeployment is required beyond the standard
 * `firebase deploy`.
 */
export const WEEKLY_TRANSFER_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

export type SupportedTimezone = (typeof WEEKLY_TRANSFER_TIMEZONES)[number];

/**
 * Sentinel value passed to `transferStats` for houses with no `timezone`
 * field set. Kept as a named constant so calling code reads intentionally.
 */
export const FALLBACK_TIMEZONE = null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx jest src/__tests__/util/timezones.test.ts`
Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/util/timezones.ts functions/src/__tests__/util/timezones.test.ts
git commit -m "feat(scheduled): extract weekly-transfer timezone list into shared module"
```

---

## Task 2: Write failing test for consolidated handler

**Files:**

- Create: `functions/src/__tests__/scheduled/weeklyTransfers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `functions/src/__tests__/scheduled/weeklyTransfers.test.ts`:

```typescript
/**
 * Tests for the consolidated `weeklyTransfers` scheduled function.
 *
 * The v2 `onSchedule` API wraps a handler and registers Cloud Scheduler
 * metadata. We mock `onSchedule` to return the raw handler function so we
 * can invoke it directly in tests, exactly matching the pattern used by
 * `src/__tests__/scheduled/index.test.ts`.
 */

import { WEEKLY_TRANSFER_TIMEZONES } from "../../util/timezones";

// Mock firebase-functions/v2/scheduler BEFORE importing the module under test.
jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: jest.fn((_opts: unknown, handler: unknown) => handler),
}));

// Mock transferStats so we can assert invocation counts.
jest.mock("../../util/guest", () => ({
  transferStats: jest.fn(async () => ({})),
}));

// Mock firebase-admin (imported transitively via api/firestore).
jest.mock("firebase-admin", () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ id: "mock" })) })),
  })),
}));

import { weeklyTransfers } from "../../scheduled";
import { transferStats } from "../../util/guest";

describe("weeklyTransfers (consolidated scheduled handler)", () => {
  beforeEach(() => {
    (transferStats as jest.Mock).mockClear();
  });

  it("calls transferStats once per supported timezone", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    expect(transferStats).toHaveBeenCalledTimes(
      WEEKLY_TRANSFER_TIMEZONES.length + 1, // 4 timezones + 1 fallback
    );
  });

  it("passes each supported timezone to transferStats", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    for (const tz of WEEKLY_TRANSFER_TIMEZONES) {
      expect(transferStats).toHaveBeenCalledWith(null, tz);
    }
  });

  it("calls transferStats with null timezone for the fallback pass", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    expect(transferStats).toHaveBeenCalledWith(null, null);
  });

  it("continues processing remaining timezones if one fails", async () => {
    (transferStats as jest.Mock)
      .mockRejectedValueOnce(new Error("NY failed"))
      .mockResolvedValue({});

    await expect(
      (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
        scheduleTime: "2026-04-19T05:00:00Z",
      }),
    ).resolves.toBeUndefined();

    // All 5 calls attempted despite the first one throwing.
    expect(transferStats).toHaveBeenCalledTimes(
      WEEKLY_TRANSFER_TIMEZONES.length + 1,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest src/__tests__/scheduled/weeklyTransfers.test.ts`
Expected: FAIL with "Module has no exported member 'weeklyTransfers'" (or similar import error).

- [ ] **Step 3: Commit the failing test**

(Yes — commit it while red so the implementation commit is isolated.)

```bash
git add functions/src/__tests__/scheduled/weeklyTransfers.test.ts
git commit -m "test(scheduled): add failing tests for consolidated weeklyTransfers"
```

---

## Task 3: Implement the consolidated handler

**Files:**

- Modify: `functions/src/scheduled/index.ts`

- [ ] **Step 1: Add `weeklyTransfers` export replacing the 5 old ones**

Open `functions/src/scheduled/index.ts`. Replace the entire block from line 55 ("SCHEDULED WEEKLY TRANSFERS" comment) through line 183 (end of `scheduledWeeklyTransferFallback`) with:

```typescript
// ============================================================================
// SCHEDULED WEEKLY TRANSFERS (consolidated)
// ============================================================================
// Runs every Sunday at 05:00 UTC. A single function iterates all supported
// timezones and calls transferStats() for each. Houses are filtered by their
// `timezone` column inside transferStats, so each pass only processes the
// houses belonging to that timezone. The final pass (FALLBACK_TIMEZONE = null)
// processes houses that have no timezone set at all.
//
// Why one function instead of five:
//   - Each v2 function consumes Cloud Run CPU quota as maxInstances * cpu.
//     Collapsing 5 → 1 reclaims quota headroom.
//   - There is no public API contract for scheduler function names.
//   - transferStats is idempotent per-house, so sequential per-timezone
//     execution is safe.
//
// Trade-off: the week-boundary now moves to 05:00 UTC Sunday for all
// timezones, instead of local midnight. This is acceptable because the
// currentWeek/previousWeek data model is not tied to the exact clock moment.
// ============================================================================

export const weeklyTransfers = onSchedule(
  { schedule: "0 5 * * 0", timeZone: "UTC" },
  async (event) => {
    logger.info("weeklyTransfers: starting consolidated weekly run", {
      scheduledTime: event.scheduleTime,
      timezones: WEEKLY_TRANSFER_TIMEZONES,
    });

    for (const tz of WEEKLY_TRANSFER_TIMEZONES) {
      try {
        const guests = await transferStats(null, tz);
        logger.info(
          `weeklyTransfers: processed ${Object.keys(guests).length} guests`,
          {
            timezone: tz,
          },
        );
      } catch (error) {
        logger.error("weeklyTransfers: timezone pass failed", {
          timezone: tz,
          error: (error as Error).message,
        });
        // Continue to next timezone — do not rethrow.
      }
    }

    try {
      const guests = await transferStats(null, FALLBACK_TIMEZONE);
      logger.info(
        `weeklyTransfers: fallback processed ${Object.keys(guests).length} guests`,
      );
    } catch (error) {
      logger.error("weeklyTransfers: fallback pass failed", {
        error: (error as Error).message,
      });
    }
  },
);
```

- [ ] **Step 2: Add the new imports at the top of `functions/src/scheduled/index.ts`**

Below the existing `import { transferStats } from "../util/guest";` line, add:

```typescript
import {
  WEEKLY_TRANSFER_TIMEZONES,
  FALLBACK_TIMEZONE,
} from "../util/timezones";
```

- [ ] **Step 3: Run the new tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/scheduled/weeklyTransfers.test.ts`
Expected: PASS, all 4 tests pass.

- [ ] **Step 4: Run the full existing scheduled test file to ensure no regression**

Run: `cd functions && npx jest src/__tests__/scheduled/`
Expected: All existing tests still pass. Note that tests for the old `scheduledWeeklyTransferEST`-style exports will now fail because those exports no longer exist.

- [ ] **Step 5: Remove obsolete tests for the old per-timezone exports**

Open `functions/src/__tests__/scheduled/index.test.ts`. Delete every `describe`/`it` block that references `scheduledWeeklyTransferEST`, `scheduledWeeklyTransferCST`, `scheduledWeeklyTransferMST`, `scheduledWeeklyTransferPST`, or `scheduledWeeklyTransferFallback`.

Do NOT delete tests for `updateDisputes` or `warmWebsite`.

- [ ] **Step 6: Rerun all scheduled tests**

Run: `cd functions && npx jest src/__tests__/scheduled/`
Expected: All remaining tests pass (weeklyTransfers tests + updateDisputes + warmWebsite).

- [ ] **Step 7: Run full test suite**

Run: `cd functions && npm test`
Expected: Full suite passes. No regressions in other areas.

- [ ] **Step 8: Typecheck**

Run: `cd functions && npm run build`
Expected: `tsc` completes with no errors. No dangling references to the removed exports.

- [ ] **Step 9: Commit**

```bash
git add functions/src/scheduled/index.ts functions/src/__tests__/scheduled/index.test.ts
git commit -m "refactor(scheduled): consolidate 5 weekly-transfer schedulers into 1

Replaces scheduledWeeklyTransferEST/CST/MST/PST/Fallback with a single
weeklyTransfers function that iterates WEEKLY_TRANSFER_TIMEZONES
internally. Saves 4 Cloud Run function slots under the us-central1 CPU
quota. Week-boundary moves to 05:00 UTC Sunday for all timezones."
```

---

## Task 4: Delete the 5 obsolete deployed functions

The old function names will remain deployed as orphans until explicitly deleted — `firebase deploy` does not remove functions whose source exports were deleted unless `--force` and the functions are listed in the purge prompt (which is only interactive).

**Files:** none (operational only)

- [ ] **Step 1: List current deployed function names to confirm targets**

Run:

```bash
cd /Users/marcusklein/dev/regroup-functions && \
  source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && \
  firebase functions:list --project phoenix-cleanhouse 2>&1 | \
  sed 's/\x1b\[[0-9;]*m//g' | \
  grep -E 'scheduledWeeklyTransfer'
```

Expected: 5 entries listed — `scheduledWeeklyTransferCST`, `-EST`, `-MST`, `-PST`, `-Fallback`.

- [ ] **Step 2: Delete the 5 obsolete functions**

Run:

```bash
cd /Users/marcusklein/dev/regroup-functions && \
  source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && \
  firebase functions:delete \
    scheduledWeeklyTransferCST scheduledWeeklyTransferEST \
    scheduledWeeklyTransferMST scheduledWeeklyTransferPST \
    scheduledWeeklyTransferFallback \
    --project phoenix-cleanhouse --force
```

Expected: 5 "Successful delete operation" lines. Non-blocking 404s on Cloud Scheduler jobs are harmless (the jobs may have been cleaned up out-of-band in prior deploys).

- [ ] **Step 3: Verify the orphans are gone**

Run the same `firebase functions:list | grep scheduledWeeklyTransfer` command.
Expected: Zero output.

---

## Task 5: Deploy the new consolidated function

**Files:** none (operational only)

- [ ] **Step 1: Deploy only the new scheduled function to reduce blast radius**

Run:

```bash
cd /Users/marcusklein/dev/regroup-functions && \
  source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && \
  firebase deploy --only functions:weeklyTransfers --project phoenix-cleanhouse
```

Expected: `✔ functions[weeklyTransfers(us-central1)] Successful create operation.`
If the deploy reports quota errors, the global `setGlobalOptions({ cpu: 0.167, maxInstances: 2 })` already in place should be sufficient since net function count decreases.

- [ ] **Step 2: Verify the Cloud Scheduler job was created**

Run:

```bash
gcloud scheduler jobs list --location=us-central1 --project=phoenix-cleanhouse \
  --format="table(name,schedule,state)" | grep -i weekly
```

Expected: One job named `firebase-schedule-weeklyTransfers-us-central1` with schedule `0 5 * * 0`, state `ENABLED`.

- [ ] **Step 3: Trigger one manual run to validate the function executes end-to-end**

Run:

```bash
gcloud scheduler jobs run firebase-schedule-weeklyTransfers-us-central1 \
  --location=us-central1 --project=phoenix-cleanhouse
```

Then watch logs:

```bash
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="weeklytransfers"' \
  --project=phoenix-cleanhouse --limit=50 --format="value(timestamp,textPayload,jsonPayload.message)"
```

Expected: Log lines showing "weeklyTransfers: starting consolidated weekly run", followed by 5 per-timezone log lines ("weeklyTransfers: processed N guests" for each of the 4 timezones + 1 fallback). No uncaught exceptions.

- [ ] **Step 4: Verify quota draw dropped**

Run:

```bash
firebase functions:list --project phoenix-cleanhouse 2>&1 | grep -c scheduled
```

Compare to pre-change count. Expected: decreased by 4 (from 8 to 4 scheduled functions).

---

## Task 6: Document the change

**Files:**

- Modify: `functions/README.md` (if exists) or create the scheduled-function section.

- [ ] **Step 1: Locate existing docs**

Run:

```bash
ls functions/README.md functions/docs 2>&1 | head -5
```

If `functions/README.md` exists and has a "Scheduled Functions" section, update it. If not, skip this task (documentation is optional for internal-only refactors — the git history and in-code comments are sufficient).

- [ ] **Step 2: If README exists, update it**

Replace any references to `scheduledWeeklyTransferEST`, `-CST`, `-MST`, `-PST`, `-Fallback` with a single paragraph:

```markdown
### `weeklyTransfers`

Runs every Sunday at 05:00 UTC. Iterates the timezones defined in
`src/util/timezones.ts` and calls `transferStats()` for each, rolling
guest `currentWeek`/`previousWeek` data. Replaces the per-timezone
schedulers removed in April 2026; the week-boundary is now globally
aligned to 05:00 UTC Sunday.
```

- [ ] **Step 3: Commit**

```bash
git add functions/README.md
git commit -m "docs(scheduled): document consolidated weeklyTransfers function"
```

(Skip this commit if no README was updated.)

---

## Rollback Plan

If the consolidated function misbehaves in production:

1. **Immediate**: Re-deploy the previous version of `scheduled/index.ts` from `git show <prior-commit>:functions/src/scheduled/index.ts`. Firebase will re-create the 5 old schedulers.
2. **Verification**: After rollback deploy, the next Sunday each timezone's local-midnight cron will fire as before.
3. **Cloud Scheduler jobs**: `firebase deploy` re-creates the scheduler jobs automatically. Do not manually recreate them.

The net function count briefly returns to the pre-consolidation state during rollback, which is fine (the quota ceiling already accommodated that count plus four more).

---

## Acceptance Criteria

- [ ] `functions/src/util/timezones.ts` exports `WEEKLY_TRANSFER_TIMEZONES` and `FALLBACK_TIMEZONE`.
- [ ] `functions/src/scheduled/index.ts` exports exactly one weekly-transfer function (`weeklyTransfers`).
- [ ] The 5 old exports (`scheduledWeeklyTransferEST/CST/MST/PST/Fallback`) are removed from source.
- [ ] The 5 old deployed functions are deleted from the Firebase project.
- [ ] `weeklyTransfers` is deployed, scheduler job is enabled, manual trigger succeeds.
- [ ] All Jest tests pass.
- [ ] `firebase functions:list` shows 4 scheduled functions total (`weeklyTransfers`, `updateDisputes`, `warmWebsite`, `officerTermReminder`).
- [ ] `git log` shows incremental commits per task.
