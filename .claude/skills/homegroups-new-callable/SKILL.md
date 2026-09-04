---
name: homegroups-new-callable
description: Scaffold a new Homegroups Cloud Functions callable (create, add, new callable, new cloud function). Takes the function name as an argument, e.g. /new-callable archiveGroup. Generates src/callable/<name>.ts, wires it into src/index.ts, and writes a matching Jest test in src/__tests__/<name>.test.ts following this codebase's requireAuth/validateData conventions.
---

> **Unit:** `homegroups/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups"` first.
# New Callable (Homegroups functions)

`homegroups/functions/src/callable/` is the highest-churn directory in this
repo (91 callables and counting). This skill scaffolds a new one that matches
the conventions actually used here — verified against the live code, not
assumed. **Do not reuse regroup's `new-callable` skill** — regroup's functions
codebase uses different conventions; this one is homegroups-specific.

Argument: the callable's name in `camelCase`, e.g. `archiveGroup`. If not
supplied, ask for it before proceeding.

## 1. Decide the shape

- **Mutation** (writes data) → return `{ success: boolean, ...fields }`.
- **Read-only** (fetches data) → return the typed resource directly, **no**
  `success` field. See `getPublicGroupProfile.ts`.
- **Authenticated** (the default) → gate with `requireAuth`.
- **Deliberately public** (rare — e.g. `getPublicGroupProfile`,
  `submitPartnershipLead`) → skip `requireAuth` on purpose, rate-limit it
  instead (see step 5), and leave a comment saying so.

## 2. Create `src/callable/<name>.ts`

Standard case — authenticated mutation, Zod-validated:

```ts
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import { db } from '../utils/firebase';
import * as admin from 'firebase-admin';
import { requireAuth, validateData } from '../utils/callableWrapper';

const myCallableSchema = z.object({
  groupId: z.string().min(1),
  // ...every field the client may send, nothing more — validateData's
  // Zod parse silently strips anything not declared here.
});

interface MyCallableResult {
  success: boolean;
  // ...
}

export const myCallable = onCall(
  async (request: CallableRequest<z.infer<typeof myCallableSchema>>): Promise<MyCallableResult> => {
    const callerId = requireAuth(request);
    const data = validateData(myCallableSchema, request.data);

    try {
      // Permission / business-rule checks BEFORE any write, e.g.:
      //   const groupDoc = await db.collection("groups").doc(data.groupId).get();
      //   if (!groupDoc.data()?.admins?.includes(callerId)) {
      //     throw new HttpsError("permission-denied", "Only group admins can do this.");
      //   }
      // For group actions gated on an active paid subscription, also call
      // assertGroupActive(groupData) from ../utils/subscriptionGuard.

      // ...the actual mutation...

      logger.info('myCallable succeeded', { callerId, groupId: data.groupId });
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error in myCallable', { error });
      throw new HttpsError('internal', 'Operation failed.');
    }
  },
);
```

Notes verified against real callables (`banUser.ts`, `checkInToMeeting.ts`,
`joinGroupByInviteCode.ts`, `getPublicGroupProfile.ts`):

- The two-line auth+validate opening (`requireAuth` then `validateData`) is
  the pattern to copy, not the reverse or interleaved order.
- Only add the `onCall({ cpu, memory, timeoutSeconds }, handler)` two-arg
  form if you actually need non-default memory/timeout/CPU (see
  `joinGroupByInviteCode.ts`). Otherwise use the one-arg `onCall(handler)`
  form (see `banUser.ts`, `checkInToMeeting.ts`).
- **Never add `region` to that config object.** See the rule below — this is
  not a style preference, it caused a full production outage.
- Do the `catch`-and-rethrow-`HttpsError` dance shown above at the outer
  layer of every callable body: business-logic errors you threw as
  `HttpsError` pass through unchanged; anything else gets logged in full
  server-side and replaced with a sanitized generic message before it
  reaches the client.

## 3. Rule: never pin a non-default `region`

`joinGroupByInviteCode` was deployed to `us-west1` and `sendGroupInviteEmail`
to `us-east1` while the mobile client called the default `us-central1` on
every call site — invite-join was **100% broken in production** until this
was caught. The v1 `functions.https.onCall(config, handler)` form makes this
worse by silently ignoring `region` at deploy time (function lands in
`us-central1` regardless of what the config says); this codebase's v2 form
_does_ honor `region`, which is exactly why setting it is dangerous — it
actually takes effect, and the client won't know to follow.

- Leave `region` unset. All ~90 other callables deploy to the default
  `us-central1`, and the mobile client calls that default everywhere except
  where it explicitly does `firestore().app.functions('<region>')`.
- If a non-default region is ever genuinely required, update **every**
  client call site in the same change, and note that moving an existing
  function's region requires deleting the old deployment first — Firebase
  will not move it in place:
  ```bash
  firebase functions:delete <name> --region <old-region> --project recovery-connect-cad4b --force
  ```

## 4. Rule: Zod + `validateData`, not manual `typeof` checks

`callableWrapper.ts` exists because auth checks were "reimplemented ~89
times across this codebase's callables in 3 slightly different styles."
Older callables (e.g. `checkInToMeeting.ts`) still do manual
`typeof x !== "string"` checks — that's legacy, not the pattern to copy.
New callables use a `z.object({...})` schema and `validateData(schema, request.data)`.
This also gets you allow-list behavior for free: Zod's default parse mode
strips any field not declared on the schema, so a client can't smuggle in
`admins`, `stripeCustomerId`, or similar via the callable payload.

## 5. Rule: no PII in logs, ever

Per the platform-wide rule in the root `CLAUDE.md`: never log names, contact
info, health data, or recovery status — to `logger.*` calls, Cloud Functions
logs, or error responses. Log **ids** and sanitized context only:

```ts
// GOOD — matches banUser.ts / checkInToMeeting.ts
logger.info('User banned', { bannedUserId: data.userId, bannedBy: callerId });

// BAD — do not do this
logger.info(`Banned ${resolvedUserName} (${data.userId})`);
```

Errors returned to the client must be sanitized generic messages
(`"Operation failed."`, `"Unable to load group profile."`); log the full
error object server-side via `logger.error("...", { error })` first.

If a callable is deliberately unauthenticated and public-facing, add
`enforceRateLimit` from `../utils/rateLimit` (keyed by `callerKey(request)`)
so it can't be hammered — see `getPublicGroupProfile.ts`:

```ts
import { enforceRateLimit, callerKey } from '../utils/rateLimit';
// first line of the handler:
await enforceRateLimit(`myCallable:${callerKey(request)}`);
```

## 6. Register the export in `src/index.ts`

Add one line near functions it's conceptually grouped with (index.ts uses
loose feature-wave grouping with comments like `// V4.3: Analytics`, not
strict alphabetical order) — or at the end of the `--- Callable Functions ---`
block if there's no obvious group:

```ts
export { myCallable } from './callable/myCallable';
```

Forgetting this step means the function builds and tests pass but never
actually deploys — `index.ts` is the only file Firebase reads to discover
functions.

## 7. Write `src/__tests__/<name>.test.ts`

`jest.setup.ts` (wired via `jest.config.js` → `setupFiles`) already mocks
`firebase-functions/v2/https` (`onCall` returns the handler directly,
`HttpsError` is a real throwable class with `.code`) and
`firebase-functions/logger`. A new test file normally only needs to mock
`../utils/firebase` (and `firebase-admin` if you use
`admin.firestore.FieldValue.*`). Group order is auth gate → validation →
business rules → happy path (see `createIntergroup.test.ts`,
`joinGroupByInviteCode.test.ts`):

```ts
export {};

// Mock Firestore access — extend collectionName branches as needed.
const mockGet = jest.fn();
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockCollection = jest.fn((name: string) => ({
  doc: jest.fn(() => ({ get: mockGet, set: mockSet, update: mockSet })),
}));
jest.mock('../utils/firebase', () => ({ db: { collection: mockCollection } }));

// Only needed if the handler uses admin.firestore.FieldValue.*
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'SERVER_TS'),
      increment: jest.fn((n: number) => ({ __inc: n })),
    },
  }),
}));

import { myCallable } from '../callable/myCallable';

function req(data: unknown, auth: { uid: string } | undefined = { uid: 'user-1' }) {
  return { data, auth } as any;
}

describe('myCallable', () => {
  beforeEach(() => jest.clearAllMocks());

  // ---- Auth gate ----
  it('throws unauthenticated when no auth context', async () => {
    await expect(
      (myCallable as unknown as Function)(req({ groupId: 'g1' }, undefined)),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  // ---- Validation ----
  it('throws invalid-argument when groupId is missing', async () => {
    await expect((myCallable as unknown as Function)(req({}))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  // ---- Business rules ----
  it('throws permission-denied when caller is not a group admin', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ admins: [] }) });
    await expect((myCallable as unknown as Function)(req({ groupId: 'g1' }))).rejects.toMatchObject(
      { code: 'permission-denied' },
    );
  });

  // ---- Happy path ----
  it('succeeds for an admin caller', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ admins: ['user-1'] }),
    });
    const result = await (myCallable as unknown as Function)(req({ groupId: 'g1' }));
    expect(result).toMatchObject({ success: true });
  });
});
```

Run it with `cd homegroups/functions && npm test -- <name>.test.ts`.

## Before you finish — checklist

- [ ] No non-default `region` set on the callable (or every client call site
      updated in the same change if one is genuinely required)
- [ ] Input validated with a `z.object({...})` schema via `validateData` —
      not manual `typeof`/truthy checks
- [ ] Auth checked via `requireAuth`, unless deliberately public (with a
      comment explaining why, and a rate limit via `enforceRateLimit`)
- [ ] No names, emails, phone numbers, or recovery/health data in any
      `logger.*` call or thrown `HttpsError` message — ids and status only
- [ ] Full error object logged server-side; sanitized generic message
      returned to the client
- [ ] Return shape matches convention: mutation → `{ success, ...fields }`;
      read-only → typed resource, no `success` field
- [ ] Exported from `src/callable/<name>.ts` **and** re-exported from
      `src/index.ts`
- [ ] `src/__tests__/<name>.test.ts` written, covering auth gate →
      validation → business rules → happy path
- [ ] `npm run build` and `npm test` pass in `homegroups/functions`
