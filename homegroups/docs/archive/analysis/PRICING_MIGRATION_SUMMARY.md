# Pricing Model Migration Summary

## Changes Completed ✅

All subscription code has been updated from **per-member pricing** ($1/member/month) to **flat-rate pricing** ($12/year per group).

### Files Updated

1. **`functions/src/utils/stripe.ts`**

   - Updated comment for price ID variable

2. **`functions/src/callable/createGroupSubscription.ts`**

   - Removed member count requirement for subscription creation
   - Changed `quantity: memberCount` → `quantity: 1` (flat rate)
   - Updated return value: `annualCost: 12` instead of `monthlyCost: memberCount * 1`
   - Removed member count from subscription metadata

3. **`functions/src/callable/createStripeCheckoutSession.ts`**

   - Changed `quantity: memberCount` → `quantity: 1` (flat rate)
   - Removed member count validation and metadata

4. **`functions/src/callable/createGroupWithSubscription.ts`**

   - Changed `quantity: quantity` → `quantity: 1` (flat rate)
   - Updated comments and metadata

5. **`functions/src/callable/requestAdminAccessWithSubscription.ts`**

   - Changed `quantity: quantity` → `quantity: 1` (flat rate)
   - Removed member count from subscription metadata

6. **`functions/src/triggers/firestore/onGroupAdminUpdate.ts`**

   - Changed `quantity: memberCount` → `quantity: 1` (flat rate)
   - Removed member count requirement check
   - Removed member count from subscription metadata

7. **`functions/src/utils/stripeUtils.ts`**

   - **Removed** `updateSubscriptionQuantity()` function (no longer needed)
   - Updated `getSubscriptionCost()` to return flat rate: `12` (annual cost)

8. **`functions/src/callable/updateGroupMemberCount.ts`**

   - Removed subscription quantity update logic
   - Removed import of `updateSubscriptionQuantity`
   - Member count updates now only affect Firestore, not Stripe subscription

9. **`functions/src/triggers/firestore/onGroupMemberCountUpdate.ts`**

   - Simplified trigger - now only logs member count changes
   - Removed subscription update logic (flat rate means no updates needed)

10. **`functions/src/callable/getGroupSubscriptionInfo.ts`**
    - Updated to return `annualCost` instead of `currentMonthlyCost` and `projectedAnnualCost`
    - Uses `getSubscriptionCost()` which now returns annual cost directly

---

## ⚠️ Action Required: Stripe Configuration

You need to update your Stripe price configuration in the Stripe Dashboard:

### Option 1: Annual Billing (Recommended)

1. Create a new **Price** in Stripe Dashboard:

   - Type: **Recurring**
   - Billing period: **Yearly** (every 12 months)
   - Price: **$12.00 USD**
   - Usage type: **Licensed** (not metered)

2. Update the environment variable:
   ```
   STRIPE_TEST_PRICE_ID_MEMBER=<new_annual_price_id>
   ```

### Option 2: Monthly Billing (Alternative)

If you prefer monthly billing but want it to effectively be $1/month:

1. Create a new **Price** in Stripe Dashboard:

   - Type: **Recurring**
   - Billing period: **Monthly**
   - Price: **$1.00 USD**
   - Usage type: **Licensed**

2. Update the environment variable:
   ```
   STRIPE_TEST_PRICE_ID_MEMBER=<new_monthly_price_id>
   ```

### Setting Environment Variable

**Firebase Functions:**

```bash
firebase functions:config:set stripe.test_price_id_member="price_XXXXXXXXXXXXX"
```

Or using the new `.env` approach (if you're using it):
Add to your `functions/.env` file:

```
STRIPE_TEST_PRICE_ID_MEMBER=price_XXXXXXXXXXXXX
```

---

## Testing Checklist

After updating the Stripe price ID, test the following:

- [ ] Create a new group with subscription
- [ ] Update member count (verify subscription cost doesn't change)
- [ ] View subscription info (verify it shows correct annual cost)
- [ ] Create checkout session for existing group
- [ ] Request admin access with subscription
- [ ] Verify webhook handlers work correctly

---

## Breaking Changes

⚠️ **Important:** Existing subscriptions created with the old per-member pricing model will continue to work, but they will have the old quantity-based pricing. You have a few options:

1. **Let them expire naturally** - Old subscriptions will continue until they're canceled or expire
2. **Manual migration** - Contact groups with active subscriptions and help them switch
3. **Automated migration** - Create a migration script to update existing subscriptions (advanced)

**New subscriptions** will automatically use the flat-rate model.

---

## Code Changes Summary

### Before (Per-Member Pricing):

```typescript
items: [
  {
    price: priceIdMember,
    quantity: memberCount, // $1 per member
  },
];
```

### After (Flat-Rate Pricing):

```typescript
items: [
  {
    price: priceIdMember,
    quantity: 1, // Flat rate subscription
  },
];
```

---

## Next Steps

1. ✅ Code changes are complete
2. ⏳ **Update Stripe price ID** (see Action Required section above)
3. ⏳ Test subscription creation and management
4. ⏳ Update any UI/marketing materials that reference pricing
5. ⏳ Consider migration strategy for existing subscriptions (if any)

---

## Questions?

Refer to `PRICING_MODEL.md` for the full pricing strategy and rationale.
