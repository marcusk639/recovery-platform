# Pull Request Code Review

You are reviewing a pull request for **RecoveryConnect**, a privacy-first recovery community management platform for AA/NA home groups.

## Instructions

1. **Read the product context**: First, read `.github/PR_REVIEW_CONTEXT.md` to understand product-specific patterns and requirements
2. **Review all changes**: Examine all modified files in this pull request
3. **Apply product standards**: Check adherence to the patterns documented in the context file
4. **Provide structured feedback**: Use the format below

## Review Focus Areas

Based on `.github/PR_REVIEW_CONTEXT.md`, check for:

### Privacy Patterns

- Sobriety date visibility must use **`showSobrietyDate === true`** pattern (opt-in, not opt-out)
- Default behavior: **hide** unless explicitly enabled (undefined = hide)
- Never use `!== false` or other patterns that would show undefined/null values — `MemberModel.fromFirestore` defaults `showSobrietyDate` / `showPhoneNumber` to `false`, so the inverse check would unintentionally leak data.
- Same opt-in pattern applies to `showPhoneNumber` and any other future privacy toggle on `MemberModel`.

### Stripe Configuration

- Group subscriptions must use `STRIPE_PRODUCT_ID_GROUP`
- Support both test and live environment variables
- Store both `stripePriceIdGroup` and `stripeProductIdGroup`

### Redux State Management

- Async thunks with proper TypeScript types
- Refresh related data after mutations
- Use memoized selectors with caching
- Entity adapters for normalized data

### Security

- Validate `request.auth?.uid` in Cloud Functions
- Check admin/treasurer permissions before mutations
- Input validation before Firestore writes
- No sensitive data in logs or responses

### Performance

- Firestore batching for related operations (max 500)
- Query batching (groups of 10 for 'in' queries)
- Cache with TTL (typically 5 minutes)
- Use FlatList, not ScrollView with .map()

### Type Safety

- Strict TypeScript (no `any` types)
- Use domain types from `/types/domain/`
- Type guards for unknown values

### Testing

- Add `testID` props for interactive elements
- Format: `{screen}-{component}-{action}`

## Output Format

Provide feedback in this structure:

## 🔍 Code Review Summary

### ✅ Strengths

[List what's done well with specific file references]

### ⚠️ Issues Found

[List critical or blocking issues with file:line references]
[If none, write: "No critical issues found."]

### 💡 Suggestions

[List non-blocking improvements]
[If none, write: "No suggestions at this time."]

### 🧪 Testing Recommendations

[List what should be tested]

### ✔️ Review Checklist

- [ ] Privacy patterns (`=== true` opt-in for sobriety/phone visibility)
- [ ] Stripe uses group product ID
- [ ] Redux thunks properly typed
- [ ] Permission checks in place
- [ ] Data refreshed after mutations
- [ ] TypeScript strict (no `any`)
- [ ] Test IDs added for interactive elements
- [ ] Error messages user-friendly
- [ ] No sensitive data logged
- [ ] Firestore batching used where applicable

## Guidelines

- Be thorough but constructive
- Provide specific file:line references for all issues
- Include code examples for suggested fixes
- Focus on critical issues that could cause bugs or security problems
- Acknowledge good patterns and practices
