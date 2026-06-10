# Homegroups PR Review Context

## Product Overview
Homegroups is a privacy-first recovery community management platform for AA/NA home groups. The app helps groups manage meetings, treasury, service positions, and member engagement while respecting privacy boundaries around sobriety dates and personal information.

## Architecture
- **Mobile**: React Native (TypeScript) with Redux Toolkit
- **Backend**: Firebase/Firestore with Cloud Functions
- **Payments**: Stripe subscriptions for group access
- **State Management**: Redux slices with async thunks

## Critical Privacy Patterns

### Sobriety Date Privacy
**Pattern**: `showSobrietyDate === true`
- Default behavior: HIDE sobriety dates (undefined = hide)
- Opt-in only: Users must explicitly set `showSobrietyDate: true` to share
- **Never** use `!== false` checks — `undefined !== false` is `true`, which leaks private data
- Correct: `member.showSobrietyDate === true && member.sobrietyDate`
- Location: All screens displaying sobriety information, and model data paths (GroupModel.getGroupMilestones)
- Deserialization: Use `??` not `||` for boolean privacy defaults (`data.showSobrietyDate ?? true`) so stored `false` values are preserved

## Treasury & Financial Patterns

### Prudent Reserve
- Stored in `treasury_overviews` collection (NOT nested in group document)
- Default: $600, range: $0-$10,000
- Configurable by admins and treasurers only

### Stripe Subscriptions
- Use `STRIPE_PRODUCT_ID_GROUP` for group subscriptions
- Support both test and live modes (auto-detected)
- Store both `stripePriceIdGroup` and `stripeProductIdGroup` in group documents
- Flat rate pricing: quantity always = 1
- Trial period: 7 days (TRIAL_PERIOD_DAYS constant)

### Transactions
- Require category, amount, type (income/expense)
- Edit history tracked in `editHistory` array
- Only admins and treasurers can create/edit
- Update treasury stats after any transaction change

## Redux Patterns

### Async Thunks
- Always use `createAsyncThunk` with typed parameters
- Pattern: `<ReturnType, ArgsType, {state: RootState; rejectValue: string}>`
- Always dispatch related refresh actions after mutations
- Example: After `updateTransaction`, refresh both transactions and treasury stats

### Selectors
- Use memoized selectors with `createSelector` for derived data
- Cache data with TTL (5 minutes typical)
- Always check `isDataStale()` before using cache

### State Updates
- Use entity adapters for normalized data (`createEntityAdapter`)
- Track loading states: `idle | loading | succeeded | failed`
- Clear errors on new operations

## Cloud Functions Patterns

### Security
- Always validate `request.auth?.uid` is present
- Check admin/treasurer permissions before mutations
- Verify group membership before operations
- Never expose sensitive data in function responses

### Error Handling
- Use `HttpsError` from firebase-functions for client errors
- Log errors but don't throw on background operations (triggers)
- Return structured error objects with clear messages
- Implement compensation logic for multi-step operations

### Firestore Batching
- Use batches for related operations (group + meetings creation)
- Maximum 500 operations per batch
- Batch member queries in groups of 10 (Firestore 'in' limit)

## React Native Patterns

### Modal Management
- Always provide `onClose` callback for cleanup
- Refresh data after mutations before closing
- Use `testID` props for E2E testing
- Disable interactions during async operations

### Permission Checks
- Check both `isAdmin` and `isTreasurer` for treasury operations
- Use `disabled` prop to prevent unauthorized actions
- Provide visual feedback for disabled states (`activeOpacity`)

### Type Safety
- Always use domain types from `/types/domain/`
- Avoid `any` types - use `unknown` and type guards
- Use TypeScript strict mode

## Testing Requirements

### E2E Tests
- Use Detox for mobile E2E tests
- Test IDs must follow pattern: `{screen}-{component}-{action}`
- Example: `treasury-add-transaction-button`

### Critical Paths to Test
1. Group subscription creation and payment
2. Treasury transaction creation and editing
3. Meeting creation and cancellation notifications
4. Privacy settings (sobriety date visibility)
5. Service position handoffs

## Performance Considerations

### Firestore Queries
- Always use indexes for complex queries
- Limit results with `.limit()` (default 50 transactions)
- Cache frequently accessed data (treasury stats, group data)
- Use `serverTimestamp()` for consistency

### Mobile Performance
- Lazy load heavy components
- Use `FlatList` for large lists (never `ScrollView` with `.map()`)
- Optimize images with proper sizing
- Avoid anonymous functions in render methods

## Common Pitfalls

### ❌ Never Do
1. Use `git add .` or `git add -A` (can commit secrets)
2. Check truthy values for privacy flags
3. Double-refresh data (check if modal/thunk already refreshes)
4. Use `priceIdMember` for group subscriptions (use `productIdGroup`)
5. Nest treasury data in group documents (separate collection)
6. Skip permission checks in Cloud Functions
7. Use `--no-verify` flag on git commits
8. Commit `.env` files or API keys

### ✅ Always Do
1. Use `=== true` pattern for privacy opt-in flags (never `!== false` — leaks undefined)
2. Validate input before Firestore writes
3. Refresh related data after mutations
4. Add `testID` props for interactive elements
5. Check loading states before showing data
6. Use typed Redux selectors
7. Implement proper error boundaries
8. Add co-author attribution to commits

## Review Checklist

When reviewing PRs, verify:

- [ ] Privacy patterns correctly implemented (`=== true`, not `!== false`)
- [ ] Stripe uses group product ID, not member price ID
- [ ] Redux thunks properly typed with error handling
- [ ] Permission checks in place for mutations
- [ ] Data refreshed after updates
- [ ] TypeScript types are strict (no `any`)
- [ ] Test IDs added for new interactive components
- [ ] Cloud Functions validate auth and permissions
- [ ] Error messages are user-friendly
- [ ] No sensitive data in logs or responses
- [ ] Firestore batching used for related operations
- [ ] Cache invalidation after mutations
- [ ] Loading states properly managed
- [ ] Backend changes include compensation logic
- [ ] No hardcoded environment values
