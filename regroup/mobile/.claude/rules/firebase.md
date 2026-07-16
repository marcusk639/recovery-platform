---
description: Collection refs, timestamps, transactions, React Query, security rules
globs: "src/**/*.{ts,tsx},firebase/**"
---

# Firebase / Firestore Patterns

## Collection References

Export collection refs as module-level constants from their owning service file. Never construct `firestore.collection('guests')` inline.

```ts
// src/services/guest.tsx — define once
export const guestCollection = firestore.collection('guests');

// elsewhere — import, don't reconstruct
import { guestCollection } from '../services/guest';
```

Subcollections are accessed dynamically via the parent doc path:

```ts
firestore.collection('houses').doc(houseId).collection('votes');
```

## Timestamps

- **Writes** — `FirebaseFirestore.FieldValue.serverTimestamp()` for audit fields (`createdAt`, `lastUpdated`, `loggedAt`). Use `new Date().toISOString()` only for client-determined times (e.g., user-selected activity date).
- **Reads** — Always use the `.toDate()` fallback: Firestore timestamps may arrive as `Timestamp`, plain `{ seconds, _seconds }`, or `Date` depending on cache state:

```ts
timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp;
```

## Error Handling in Services

Every service function touching Firestore:

```ts
try {
  // Firestore operation
} catch (error) {
  logException(error); // Sentry via src/util/logging.ts
  throw new Error('User-friendly message');
}
```

Never swallow Firebase errors. Never use `console.error`.

## Transactions & Batches

- **Transactions** (`firestore.runTransaction`) — read-modify-write that must be atomic (vote tallying, stat merging). Include retry logic with exponential backoff for `'aborted'` / `'failed-precondition'`.
- **Batch writes** (`firestore.batch`) — multiple atomic writes without reads (creating a house with admins, bulk EES records). Max 500 ops per batch.
- Prefer transactions when the write depends on current document state.

## Cloud Functions

```ts
const response = await functions.httpsCallable('createPaymentIntent')({
  guestId,
  houseId,
  amount,
});
return response.data;
```

`callHttpsFunction` wrapper in `firebase-setup.ts` is also acceptable — be consistent within a service file. Cloud Functions live in `../functions/` (sibling directory within the recovery-platform monorepo).

## React Query Patterns

Query files in `src/state/queries/` must follow:

1. **Key factories** — `keys` object at top of each query file:

```ts
export const activityKeys = {
  all: ['activities'],
  lists: () => [...activityKeys.all, 'list'],
  list: filters => [...activityKeys.lists(), filters],
};
```

2. **staleTime** — Activities/Guests: `30000` (30s). Houses: `60000` (60s).

3. **Optimistic updates** — snapshot in `onMutate`, rollback in `onError`, invalidate in `onSettled`.

4. **enabled guards** — `enabled: !!guestId && !!houseId`

## Offline Support

Detect network errors by checking `error.code` for `'unavailable'` or `'deadline-exceeded'`. Failed writes → `offlineQueue.enqueue()` from `src/services/offlineQueue.ts` (max 3 retries).

Firestore SDK persistence is **disabled** (commented out in `firebase-setup.ts`).

## Security Rules

Rules: `firebase/firestore.rules`. Tests: `firebase/__tests__/firestore.rules.test.ts`. **Always update tests when modifying rules.**

Key conventions:

- Helpers at top: `signedIn()`, `isHouseAdmin()`, `isHouseGuest()`, `isAdmin()`, `isSameUser()`
- `isAdmin()` covers both `admin` and `superAdmin` — use it, never check individual roles
- Ownership for subcollections: use `get()` to resolve parent doc's `userId`, not path params alone
- Governance docs (votes): `allow update, delete: if false` — explicitly immutable
- Server-only collections (webhookEvents): `allow read, write: if false`
- Oxford writes gated by `houseOxfordActive(houseId)` helper

## Pagination

Cursor-based: `startAfter(cursor).limit(pageSize + 1)`. The `+1` detects whether more pages exist. Pair with `useInfiniteQuery` and `getNextPageParam: (lastPage) => lastPage.nextCursor`.

## Real-Time Listeners

`onSnapshot()` for live data (chat, guest status). Always return and call the unsubscribe function on unmount or subscription change. Handle errors in the error callback.

## Gotcha: Emulator Host

Firebase emulator must connect to `127.0.0.1`, not `localhost` (IPv6 issues on macOS). See `src/config/firebase-emulator.ts`.
