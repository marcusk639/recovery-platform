# Firestore Index Analysis

## Current Deployed Indexes

The following indexes are currently deployed to the `phoenix-cleanhouse` Firebase project:

```json
{
  "indexes": [
    {
      "collectionGroup": "na-meetings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "day", "order": "ASCENDING" },
        { "fieldPath": "gehoash", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "na-meetings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gehoash", "order": "ASCENDING" },
        { "fieldPath": "day", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## Collections in Use

| Collection      | Purpose                                  |
| --------------- | ---------------------------------------- |
| `guests`        | Guest/resident records with weekly stats |
| `houses`        | Sober living house configurations        |
| `users`         | User accounts and subscription metadata  |
| `admins`        | Administrator records                    |
| `notifications` | Push notification records                |
| `meetings`      | Custom meeting definitions               |
| `na-meetings`   | Narcotics Anonymous meetings (geocoded)  |
| `guest-weeks`   | Archived weekly stats                    |
| `guest-reports` | Weekly summary reports                   |
| `stripeEvents`  | Stripe webhook event logs                |
| `contact`       | Contact form submissions                 |
| `disputes`      | Stat dispute records                     |
| `bugs`          | Bug reports                              |
| `feedback`      | User feedback                            |

---

## Query Analysis by Repository

### Cloud Functions (regroup-functions)

| File               | Collection    | Query Pattern                                                  | Index Required?             |
| ------------------ | ------------- | -------------------------------------------------------------- | --------------------------- |
| `util/guest.ts`    | `houses`      | `.where('id', '==', houseId)`                                  | ❌ No (single equality)     |
| `util/guest.ts`    | `houses`      | `.where('timezone', '==', timezone)`                           | ❌ No (single equality)     |
| `util/guest.ts`    | `guests`      | `.where('houseId', '==', house.id)`                            | ❌ No (single equality)     |
| `util/disputes.ts` | `guests`      | `.where('id', '==', guestId)`                                  | ❌ No (single equality)     |
| `api/firestore.ts` | `houses`      | `.where('geohash', '>=', lower).where('geohash', '<=', upper)` | ❌ No (range on same field) |
| `api/firestore.ts` | `users`       | `.where('subscriptionMetadata.subscriptionId', '==', id)`      | ⚠️ Maybe (nested field)     |
| `api/firestore.ts` | `houses`      | `.where('superAdminIds', 'array-contains', id)`                | ❌ No (auto-indexed)        |
| `util/meetings.ts` | `na-meetings` | `.where('geohash', '>=', ...).where('geohash', '<=', ...)`     | ❌ No (range on same field) |

### Mobile App (rats)

| File                 | Collection | Query Pattern                                                  | Index Required?             |
| -------------------- | ---------- | -------------------------------------------------------------- | --------------------------- |
| `services/users.tsx` | `users`    | `.where('housesOwned', 'array-contains', houseId)`             | ❌ No (auto-indexed)        |
| `services/house.tsx` | `houses`   | `.where('geohash', '>=', lower).where('geohash', '<=', upper)` | ❌ No (range on same field) |
| `services/crud.tsx`  | Various    | `.where(attribute, operator, value)`                           | ❌ No (single field)        |

### Web App (rats-web)

| File                       | Collection | Query Pattern                        | Index Required?      |
| -------------------------- | ---------- | ------------------------------------ | -------------------- |
| `services/base-service.ts` | Various    | `.where(attribute, operator, value)` | ❌ No (single field) |

---

## Issues Found

### 1. 🔴 CRITICAL: Typo in Existing Indexes - `gehoash` vs `geohash`

**Severity: Critical**

The existing `na-meetings` indexes use the field name `gehoash` (typo), but the **active code** in `util/meetings.ts` queries using `geohash` (correct):

```typescript
// In util/meetings.ts (line 574-575) - ACTIVE CODE
.where("geohash", ">=", location[0])
.where("geohash", "<=", location[1])
```

The typo appears in **commented-out code** in `api/firestore.ts`:

```typescript
// COMMENTED OUT - has typo
// .where('gehoash', '>=', range.lower)
// .where('gehoash', '<=', range.upper)
```

**Impact:** The deployed indexes are **completely unused**. The na-meetings queries are:

- Either doing full collection scans (slow, expensive)
- Or falling back to single-field auto-indexes on `geohash`

**Root Cause:** Indexes were created for old commented-out code that had the typo.

**Recommendation:**

1. The existing indexes with `gehoash` are **dead/unused** and can be deleted
2. Since the active query only uses range on `geohash` (same field), **no composite index is needed**
3. If you want to add `day` filtering in the future, create a composite index with correct spelling

### 2. ✅ Nested Field Index May Be Needed

The query `.where('subscriptionMetadata.subscriptionId', '==', subscriptionId)` on the `users` collection uses a nested field. Firestore automatically indexes simple fields but nested object fields may require explicit index creation if queries are slow.

**Current Status:** Likely working fine for small dataset, but monitor performance.

### 3. ⚠️ Unused Composite Index Pattern (Commented Code)

In `api/firestore.ts`, there's commented code suggesting a future query pattern:

```typescript
// .where('day', '==', day)
// .where('gehoash', '>=', range.lower)
// .where('gehoash', '<=', range.upper)
```

If this pattern is ever enabled, it would require a composite index:

- Collection: `na-meetings`
- Fields: `day` (==) + `geohash` (>=, <=)

**The existing indexes appear to be for this pattern** (day + gehoash), but with the typo.

---

## Recommended Index Configuration

Based on the analysis, here is the recommended `firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": [
    {
      "collectionGroup": "users",
      "fieldPath": "subscriptionMetadata.subscriptionId",
      "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }]
    }
  ]
}
```

**Why no composite indexes are currently needed:**

1. **na-meetings queries**: Only use range queries on `geohash` field (same field range = no composite needed)
2. **houses queries**: Only use range queries on `geohash` field (same field range = no composite needed)
3. **All other queries**: Single-field equality or array-contains (auto-indexed)

**Future-proofing:** If you want to enable day-based filtering for NA meetings, add:

```json
{
  "collectionGroup": "na-meetings",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "day", "order": "ASCENDING" },
    { "fieldPath": "geohash", "order": "ASCENDING" }
  ]
}
```

---

## Missing Indexes Summary

| Priority    | Collection | Fields                                | Reason                                             |
| ----------- | ---------- | ------------------------------------- | -------------------------------------------------- |
| 🟢 None     | -          | -                                     | No composite indexes currently needed              |
| 🟡 Optional | `users`    | `subscriptionMetadata.subscriptionId` | Nested field - only if performance issues observed |

### Indexes to DELETE (unused)

| Collection    | Fields           | Reason                          |
| ------------- | ---------------- | ------------------------------- |
| `na-meetings` | `day`, `gehoash` | Typo in field name - never used |
| `na-meetings` | `gehoash`, `day` | Typo in field name - never used |

---

## Action Items

### Immediate (Cleanup)

1. **Delete unused indexes** - The existing `na-meetings` indexes with `gehoash` typo are not being used:
   ```bash
   # Go to Firebase Console → Firestore → Indexes → Delete the two na-meetings indexes
   ```

### Optional (Performance Monitoring)

2. **Monitor query performance** using Firebase Console → Firestore → Indexes → Usage tab

   - If any "missing index" warnings appear, create the suggested indexes
   - Watch for slow queries in Cloud Functions logs

3. **Consider nested field index** if subscription lookups are slow:
   ```bash
   # Only if needed - add fieldOverride for subscriptionMetadata.subscriptionId
   ```

### Future Enhancement

4. **If enabling day-based meeting filtering**, create composite index:
   ```json
   {
     "collectionGroup": "na-meetings",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "day", "order": "ASCENDING" },
       { "fieldPath": "geohash", "order": "ASCENDING" }
     ]
   }
   ```

---

## Notes

- **Single-field equality queries** (e.g., `.where('id', '==', value)`) do not require composite indexes
- **Range queries on the same field** (e.g., `.where('x', '>=', a).where('x', '<=', b)`) do not require composite indexes
- **Array-contains queries** are automatically indexed by Firestore
- **Composite indexes** are only needed when querying multiple different fields

---

_Generated: December 25, 2025_
