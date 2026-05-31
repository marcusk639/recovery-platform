# Paywall Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate Oxford feature writes behind Firestore rules, backfill `subscriptionStatus` on existing house documents, and flip the House entity default so new houses start in trial rather than free-active.

**Architecture:** Three sequential tasks. Tasks 1 and 2 are independent (different repos); Task 3 depends on Task 2's migration having been run in production, so it ships after migration is confirmed. Each task is committed separately so rollback is scoped.

**Tech Stack:** Firebase Firestore security rules + `@firebase/rules-unit-testing`, Node.js migration script using Firebase Admin SDK + Stripe SDK, React Native TypeScript.

---

## Repos

| Repo            | Location                                   |
| --------------- | ------------------------------------------ |
| Mobile app      | `/Users/marcusklein/dev/rats-v2`           |
| Cloud Functions | `/Users/marcusklein/dev/regroup-functions` |

## Prerequisites (manual — do before running any task)

- [ ] Firebase Firestore emulator running on port 8080 for Task 1 tests:
  ```bash
  cd /Users/marcusklein/dev/rats-v2/firebase
  firebase emulators:start --only firestore
  ```
- [ ] `STRIPE_SECRET_KEY` env var set for Task 2 (live key for production backfill):
  ```bash
  export STRIPE_SECRET_KEY=sk_live_...
  ```
- [ ] Task 2 migration confirmed to have processed all houses before executing Task 3.

---

## File Map

| File                                                      | Action                                                                 | Task |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ---- |
| `firebase/firestore.rules`                                | Modify — add `houseOxfordActive()` helper, gate Oxford writes          | 1    |
| `firebase/__tests__/firestore.rules.test.ts`              | Modify — add Oxford gate test cases                                    | 1    |
| `functions/src/scripts/migrateHouseSubscriptionStatus.ts` | Create — backfill script                                               | 2    |
| `src/entities/House.tsx`                                  | Modify — change `subscriptionStatus` default `'active'` → `'trialing'` | 3    |

---

## Task 1: Firestore rules — Oxford gate on subscription status

Oxford subcollection writes (officers, business-meetings, votes) are currently only guarded by house membership. This task adds a `get()`-based subscription check so writes require an active Oxford subscription.

**Note:** Reads are intentionally left ungated — lapsed-subscription users can still view historical Oxford records.

**Files:**

- Modify: `firebase/firestore.rules`
- Modify: `firebase/__tests__/firestore.rules.test.ts`

- [ ] **Step 1.1: Write failing tests for the Oxford gate**

  Append to `firebase/__tests__/firestore.rules.test.ts` after the existing `paymentMethods` tests:

  ```typescript
  // ---------------------------------------------------------------------------
  // Oxford gate — writes require active Oxford subscription
  // ---------------------------------------------------------------------------

  const OXFORD_HOUSE_ID = 'oxfordHouse';

  describe('Oxford officers — write gate', () => {
    test('DENY admin write when oxfordEnabled=true but subscriptionStatus=canceled', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'canceled',
        });
      });
      await assertFails(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
          name: 'President',
          userId: ADMIN_UID,
        }),
      );
    });

    test('DENY admin write when subscriptionStatus=active but oxfordEnabled=false', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: false,
          subscriptionStatus: 'active',
        });
      });
      await assertFails(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
          name: 'President',
          userId: ADMIN_UID,
        }),
      );
    });

    test('ALLOW admin write when oxfordEnabled=true and subscriptionStatus=active', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'active',
        });
      });
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
          name: 'President',
          userId: ADMIN_UID,
        }),
      );
    });

    test('ALLOW admin write when oxfordEnabled=true and subscriptionStatus=trialing', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'trialing',
        });
      });
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
          name: 'President',
          userId: ADMIN_UID,
        }),
      );
    });

    test('ALLOW admin read of officers even when subscription canceled', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'canceled',
        });
        await setDoc(
          doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`),
          { name: 'President', userId: ADMIN_UID },
        );
      });
      await assertSucceeds(
        getDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`)),
      );
    });
  });

  describe('Oxford votes — write gate', () => {
    test('DENY admin vote create when subscription canceled', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'canceled',
        });
      });
      await assertFails(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
          question: 'Approve budget?',
          createdBy: ADMIN_UID,
        }),
      );
    });

    test('DENY guest vote cast when subscription canceled', async () => {
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, OXFORD_HOUSE_ID),
      );
      await testEnv.withSecurityRulesDisabled(async adminCtx => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: 'canceled',
        });
        await setDoc(
          doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
          { question: 'Approve budget?' },
        );
      });
      await assertFails(
        setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
          question: 'Approve budget?',
          vote: 'yes',
        }),
      );
    });
  });
  ```

- [ ] **Step 1.2: Run tests to confirm they fail (rules not updated yet)**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest firebase/__tests__/firestore.rules.test.ts --testNamePattern="Oxford" -t "Oxford" 2>&1 | tail -20
  ```

  Expected: tests fail with `PERMISSION_DENIED` in unexpected places (the deny tests may pass accidentally, allow tests fail).

- [ ] **Step 1.3: Add `houseOxfordActive()` helper and update Oxford rules**

  In `firebase/firestore.rules`, insert the new helper function after the `isGuestOrAdmin` function (after line 61):

  ```
  function houseOxfordActive(houseId) {
    let h = get(/databases/$(database)/documents/houses/$(houseId)).data;
    return h.oxfordEnabled == true &&
      (h.subscriptionStatus == 'active' || h.subscriptionStatus == 'trialing');
  }
  ```

  Then update the Oxford subcollection rules (replace the three existing Oxford blocks):

  ```
  // Oxford House: officer roster — read open to members; writes require active Oxford subscription
  match /officers/{officerId} {
    allow read: if isGuestOrAdmin([houseId]);
    allow create, update, delete: if isAdmin([houseId]) && houseOxfordActive(houseId);
  }

  // Oxford House: business meeting records — read open; writes require active Oxford subscription
  match /business-meetings/{meetingId} {
    allow read: if isGuestOrAdmin([houseId]);
    allow create, update: if isGuestOrAdmin([houseId]) && houseOxfordActive(houseId);
    allow delete: if isAdmin([houseId]);
  }

  // Oxford House: governance votes — read open; creates and casts require active Oxford subscription
  match /votes/{voteId} {
    allow read: if isGuestOrAdmin([houseId]);
    allow create: if isAdmin([houseId]) && houseOxfordActive(houseId);
    allow update: if isGuestOrAdmin([houseId]) && houseOxfordActive(houseId);
    allow delete: if false;
  }
  ```

- [ ] **Step 1.4: Run all rules tests to verify passing**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest firebase/__tests__/firestore.rules.test.ts --forceExit 2>&1 | tail -15
  ```

  Expected: all tests pass, including the new Oxford gate suite.

- [ ] **Step 1.5: Commit**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  git add firebase/firestore.rules firebase/__tests__/firestore.rules.test.ts
  git commit -m "feat(rules): gate Oxford writes on active subscription + oxfordEnabled"
  ```

---

## Task 2: House subscriptionStatus backfill migration script

Existing house documents in Firestore have no `subscriptionStatus` field (the TypeScript class default of `'active'` only applies to new in-memory objects, not Firestore reads). This script inspects each house's Stripe subscription (if any) and writes the real status. Houses with no Stripe subscription are set to `'canceled'`.

Run once against production before deploying Task 3.

**Files:**

- Create: `functions/src/scripts/migrateHouseSubscriptionStatus.ts`

- [ ] **Step 2.1: Write the migration script**

  Create `/Users/marcusklein/dev/regroup-functions/functions/src/scripts/migrateHouseSubscriptionStatus.ts`:

  ```typescript
  #!/usr/bin/env node
  /**
   * Data migration: backfill subscriptionStatus on all house documents.
   *
   * Problem: House docs created before the paywall have no subscriptionStatus
   * field. The TypeScript class default 'active' only applies to in-memory
   * objects — Firestore never stored it. Without this field, the paywall gate
   * reads undefined and behaves as if the house has no subscription.
   *
   * Behavior:
   *   - Houses already having subscriptionStatus set are SKIPPED (idempotent).
   *   - Houses with a stripeSubscriptionId: fetch Stripe subscription, use real status.
   *   - Houses without a stripeSubscriptionId: set 'canceled' (no subscription = no access).
   *
   * Usage:
   *   npm run build
   *   node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run   # preview
   *   node lib/scripts/migrateHouseSubscriptionStatus.js             # live run
   *   node lib/scripts/migrateHouseSubscriptionStatus.js --limit 5  # test on 5 houses
   */

  import { houseCollection } from '../api/firestore';
  import { stripe } from '../api/stripe';

  // ---------------------------------------------------------------------------
  // CLI flags
  // ---------------------------------------------------------------------------

  const args = process.argv.slice(2);
  const DRY_RUN = args.includes('--dry-run');
  const LIMIT_IDX = args.indexOf('--limit');
  const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;

  type SubscriptionStatus =
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | '';

  const VALID_STRIPE_STATUSES = new Set<string>([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused',
  ]);

  function stripeStatusToAppStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'unpaid':
        return 'unpaid';
      default:
        return 'canceled';
    }
  }

  // ---------------------------------------------------------------------------
  // Main
  // ---------------------------------------------------------------------------

  async function main(): Promise<void> {
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Limit: ${LIMIT}`);

    const snapshot = await houseCollection.get();
    const docs = snapshot.docs.slice(0, LIMIT);
    console.log(
      `Found ${snapshot.docs.length} houses total, processing ${docs.length}`,
    );

    let skipped = 0;
    let updated = 0;
    let errors = 0;

    for (const houseDoc of docs) {
      const data = houseDoc.data() as Record<string, any>;
      const houseId = houseDoc.id;

      // Already has a real status — skip
      if (
        data.subscriptionStatus !== undefined &&
        data.subscriptionStatus !== null
      ) {
        console.log(
          `  [SKIP] ${houseId} — already has status: ${data.subscriptionStatus}`,
        );
        skipped++;
        continue;
      }

      const stripeSubscriptionId = data.stripeSubscriptionId as
        | string
        | undefined;
      let newStatus: SubscriptionStatus;

      if (stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          newStatus = VALID_STRIPE_STATUSES.has(sub.status)
            ? stripeStatusToAppStatus(sub.status)
            : 'canceled';
          console.log(
            `  [UPDATE] ${houseId} — Stripe status: ${sub.status} → ${newStatus}`,
          );
        } catch (err: any) {
          // Stripe 404 = subscription deleted
          if (err?.statusCode === 404) {
            newStatus = 'canceled';
            console.log(`  [UPDATE] ${houseId} — Stripe 404 → canceled`);
          } else {
            console.error(
              `  [ERROR] ${houseId} — Stripe lookup failed: ${err?.message}`,
            );
            errors++;
            continue;
          }
        }
      } else {
        newStatus = 'canceled';
        console.log(
          `  [UPDATE] ${houseId} — no stripeSubscriptionId → canceled`,
        );
      }

      if (!DRY_RUN) {
        await houseDoc.ref.update({ subscriptionStatus: newStatus });
      }
      updated++;
    }

    console.log(
      `\nDone. Skipped: ${skipped} | Updated: ${updated} | Errors: ${errors}`,
    );
    if (errors > 0) {
      process.exit(1);
    }
  }

  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
  ```

- [ ] **Step 2.2: Build and dry-run (requires emulator or production credentials)**

  ```bash
  cd /Users/marcusklein/dev/regroup-functions/functions
  npm run build 2>&1 | tail -10
  ```

  Expected: build completes with no TypeScript errors.

  ```bash
  node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run --limit 5
  ```

  Expected output (example):

  ```
  Mode: DRY RUN | Limit: 5
  Found 23 houses total, processing 5
    [SKIP] house_abc — already has status: active
    [UPDATE] house_def — Stripe status: active → active
    [UPDATE] house_ghi — no stripeSubscriptionId → canceled
    [UPDATE] house_jkl — Stripe 404 → canceled
    [UPDATE] house_mno — Stripe status: past_due → past_due
  Done. Skipped: 1 | Updated: 4 | Errors: 0
  ```

- [ ] **Step 2.3: Run live migration (production — only after dry-run looks correct)**

  ```bash
  node lib/scripts/migrateHouseSubscriptionStatus.js
  ```

  Expected: no errors, all houses processed.

- [ ] **Step 2.4: Commit the script**

  ```bash
  cd /Users/marcusklein/dev/regroup-functions
  git add functions/src/scripts/migrateHouseSubscriptionStatus.ts
  git commit -m "feat(scripts): backfill subscriptionStatus on house docs"
  ```

---

## Task 3: Change House entity default subscriptionStatus from 'active' to 'trialing'

**Depends on:** Task 2 migration confirmed to have run in production.

After the migration, all existing houses have an explicit `subscriptionStatus`. New houses created going forward should start in a `'trialing'` period (14-day free access, per spec) rather than silently getting `'active'` status forever.

**Files:**

- Modify: `src/entities/House.tsx` (line 81)

- [ ] **Step 3.1: Update the House entity default**

  In `/Users/marcusklein/dev/rats-v2/src/entities/House.tsx`, find line 81:

  ```typescript
  subscriptionStatus: SubscriptionStatus = 'active';
  ```

  Change to:

  ```typescript
  subscriptionStatus: SubscriptionStatus = 'trialing';
  ```

- [ ] **Step 3.2: Verify no unit tests rely on the 'active' default**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npm test -- --testPathPattern="House|house|subscription" 2>&1 | tail -20
  ```

  Expected: all tests pass. If any test snapshots or assertions hardcode `subscriptionStatus: 'active'` as the default, update them to `'trialing'`.

- [ ] **Step 3.3: Commit**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  git add src/entities/House.tsx
  git commit -m "feat(entities): new houses default to trialing instead of active

  Active-by-default silently granted full access to any house whose
  subscriptionStatus field was never written. After the migration backfill
  (migrateHouseSubscriptionStatus.ts), all existing houses have an explicit
  status. New houses start in trialing (14-day access) per the billing spec."
  ```

---

## Manual actions (not in this plan — human required)

| Action                                                         | Why manual                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| B1: BFG git history rewrite for leaked service account keys    | Requires force-push to shared remote; cannot be automated safely |
| B2: Delete `@rats-e2e.com` accounts from prod Firebase Console | Requires Firebase Console UI access                              |
| B4: HIPAA attorney consultation                                | Legal decision                                                   |
| W8: Create App Review test credentials in Firebase Console     | Requires Apple App Store reviewer account setup                  |
| Stripe subscription products                                   | Requires Stripe Dashboard and pricing decisions                  |
