# Redux Store Refactoring - TODO

## ⚠️ KNOWN ISSUES (To Address After Screen Migration)

### 1. Actions Are Bloated
- **Problem:** Redux actions contain excessive boilerplate
- **Location:** `/src/store/actions/`
- **Impact:**
  - Difficult to maintain
  - Verbose code for simple operations
  - Thunk actions mixing business logic

**Example Issues:**
```typescript
// Current: Bloated action creators
export const fetchGuests = (houseId) => async (dispatch) => {
  dispatch({ type: FETCHING_GUESTS });
  try {
    const guests = await getGuests(houseId);
    dispatch({ type: FETCHING_GUESTS_SUCCESS, payload: guests });
  } catch (error) {
    dispatch({ type: FETCHING_GUESTS_FAILED, payload: error });
  }
};

// Should be: React Query hook
const { data: guests } = useGuests(houseId);
```

### 2. Reducers Need Cleanup
- **Problem:** Reducers handling both UI and server state
- **Location:** `/src/store/reducers/`
- **Issues:**
  - Mixed concerns (loading states + data)
  - Verbose switch statements
  - Duplicate logic across reducers

**Example:**
```typescript
// guests reducer handles:
- Guest data (should be React Query)
- Loading states (should be RTK or React Query)
- Error states (should be React Query)
- Selected guest (could be RTK or React Query)
```

### 3. Services Need Reorganization
- **Problem:** Service files mixing concerns
- **Location:** `/src/services/`
- **Issues:**
  - Some services are just Firebase wrappers
  - Business logic scattered
  - Inconsistent patterns

**Example:**
```typescript
// Some services are clean:
export const getGuests = (houseId: string) => {
  return firestore.collection('guests')
    .where('houseId', '==', houseId)
    .get();
};

// Others have business logic:
export const updateGuestStats = (guest, stats) => {
  // Complex logic that should be elsewhere
};
```

---

## 📋 REFACTORING PLAN (After Screen Migration)

### Phase 1: Migrate Server State to React Query
- [ ] Create React Query hooks for all data fetching
- [ ] Replace action creators with mutations
- [ ] Remove data-related reducers

**Files to Migrate:**
- `/src/store/actions/guests.ts` → `/src/state/queries/guestQueries.ts`
- `/src/store/actions/houses.ts` → `/src/state/queries/houseQueries.ts`
- `/src/store/actions/user.ts` → `/src/state/queries/userQueries.ts`
- `/src/store/actions/dispute.ts` → Already started in `disputeQueries.ts`

### Phase 2: Keep Only UI State in Redux
- [ ] Move to Redux Toolkit slices
- [ ] Keep only: modals, toasts, loading overlays, navigation state
- [ ] Remove server state from store

**RTK Slices Needed:**
- `uiSlice.ts` ✅ (Already created)
- `authSlice.ts` ✅ (Already created)
- `themeSlice.ts` ✅ (Already created)
- `navigationSlice.ts` (Maybe - if needed)

### Phase 3: Clean Up Services
- [ ] Standardize service patterns
- [ ] Separate Firebase operations from business logic
- [ ] Create clear service boundaries

**Service Structure:**
```
/src/services/
  /firebase/          # Pure Firebase operations
    - guests.ts
    - houses.ts
    - activities.ts
  /business/          # Business logic
    - guestStats.ts
    - weekCalculations.ts
  /api/               # External APIs
    - meetings.ts
```

### Phase 4: Remove Legacy Redux
- [ ] Delete old action files
- [ ] Delete old reducer files
- [ ] Remove Redux middleware (if not needed)
- [ ] Update store to only RTK slices

---

## 🎯 CURRENT PRIORITY

**DO NOT START THIS YET - Complete screen migrations first!**

Once all screens are migrated:
1. Test app thoroughly
2. Begin Phase 1 (React Query migration)
3. Incrementally refactor (test after each change)
4. Remove legacy Redux last

---

## 📊 ESTIMATED EFFORT

- **Phase 1:** ~20 hours (React Query migration)
- **Phase 2:** ~8 hours (RTK cleanup)
- **Phase 3:** ~12 hours (Service reorganization)
- **Phase 4:** ~6 hours (Remove legacy)

**Total:** ~46 hours after screen migration complete

---

## 💡 BENEFITS POST-REFACTOR

1. **90% less Redux boilerplate**
2. **Automatic caching** with React Query
3. **Better TypeScript** support
4. **Clearer separation** of concerns
5. **Easier testing** (services independent of Redux)
6. **Better performance** (optimistic updates, background refetching)

---

**Status:** DOCUMENTED - DO AFTER SCREEN MIGRATION
**Last Updated:** 2026-01-31
