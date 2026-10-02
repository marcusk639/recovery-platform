import { logger } from "firebase-functions";
import Stripe from "stripe";
import OperatorSubscription from "../entities/OperatorSubscription";
import { User } from "../entities/User";
import { HouseType, TierKey } from "../config";
import { resolveTierPriceId, BillingInterval } from "../util/tierPricing";
import { assertPaymentMethodUsable } from "./cardValidation";

/**
 * Trial length for all new subscriptions. Stripe applies trial_period_days
 * at subscription-creation time, so subscriptions already in flight are
 * unaffected and no data migration is needed.
 */
export const TRIAL_PERIOD_DAYS = 7;

// Lazy Proxy — secrets are only available at request time in v2, not at module load.
let _stripe: Stripe | undefined;
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    if (!_stripe) {
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: process.env.STRIPE_API_VERSION! as Stripe.LatestApiVersion,
      });
    }
    // Cast through unknown so TypeScript accepts the dynamic property access
    // on the Stripe instance, which lacks an index signature by design.
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});

const planIds = {
  house: process.env.STRIPE_HOUSE_PRICE_ID!, // Regroup House — $49/month (prod_UYy6h1eZ5G5WD2)
  guest: process.env.STRIPE_GUEST_PRICE_ID!, // legacy per-guest plan — retained for existing subscribers
};

export const HOUSE_PRICE_ID = process.env.STRIPE_HOUSE_PRICE_ID!;

// ── Bundle-discount coupon IDs ─────────────────────────────────────────────
const bundleCouponIds = {
  bundle3: "regroup-bundle-3",
  bundle5: "regroup-bundle-5",
} as const;

/**
 * Returns the coupon ID that should be applied for the given house count,
 * or null if no discount applies.
 */
export const getBundleCoupon = (houseCount: number): string | null => {
  if (houseCount >= 5) return bundleCouponIds.bundle5;
  if (houseCount >= 3) return bundleCouponIds.bundle3;
  return null;
};

export const OXFORD_PRICE_ID = process.env.STRIPE_OXFORD_PRICE_ID!; // Regroup Oxford — $79/month (prod_UYy6cF0Ccj8fID)

/**
 * Day bucket for idempotency keys. Stripe keys expire after 24h, so a day is the
 * natural granularity: a retry or double-submit within the day is deduped by
 * Stripe, while a genuinely new operation tomorrow is not blocked. Matches the
 * convention rent collection already uses (`${guestId}-${houseId}-${dayKey}`).
 */
const idempotencyDay = (): string => new Date().toISOString().slice(0, 10);

/**
 * Keys must not contain PII — they are echoed in logs and in Stripe's own
 * request records. Key off ids, never the operator's email.
 */
export const createCustomer = async (
  email: string,
  paymentMethod: string,
  idempotencyKey?: string,
) => {
  const params = {
    email,
    payment_method: paymentMethod,
    invoice_settings: {
      default_payment_method: paymentMethod,
    },
  };
  // Omit the options object entirely when unkeyed, rather than passing
  // undefined — callers and tests assert on the argument list.
  return idempotencyKey
    ? stripe.customers.create(params, { idempotencyKey })
    : stripe.customers.create(params);
};

export const updatePaymentMethod = async (
  customerId: string,
  paymentMethod: string,
) => {
  const payment = await stripe.paymentMethods.attach(paymentMethod, {
    customer: customerId,
  });
  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: payment.id,
    },
  });
};

export const cancelSubscription = async (subscriptionId: string) => {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
};

export const uncancelSubscription = async (subscriptionId: string) => {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
};

export const createSubscription = async (
  customerId: string,
  oxfordEnabled: boolean = false,
  userId?: string,
) => {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        plan: oxfordEnabled ? OXFORD_PRICE_ID : planIds.house,
        quantity: 0,
      },
      {
        plan: planIds.guest,
        quantity: 0,
      },
    ],
    trial_period_days: TRIAL_PERIOD_DAYS,
    // Embed userId at creation so webhook handlers can resolve the operator
    // without an extra Firestore query. Passing it here avoids a second
    // Stripe round-trip that could fail after the subscription is already live.
    ...(userId ? { metadata: { userId } } : {}),
  });
};

/**
 * Tier-based (flat-fee) subscription creation. Unlike createSubscription's
 * two-item house+guest model, this builds a SINGLE line item at the price
 * resolved from the tier config, with a trial (see TRIAL_PERIOD_DAYS). Used only when
 * TIER_BILLING_ENABLED is on. The legacy createSubscription is left untouched
 * for grandfathered subscribers.
 */
export const createTierSubscription = async (
  customerId: string,
  houseType: HouseType,
  tier: TierKey,
  userId?: string,
  billingInterval: BillingInterval = "month",
  idempotencyKey?: string,
) => {
  const price = resolveTierPriceId(houseType, tier, billingInterval);
  const params = {
    customer: customerId,
    items: [{ price, quantity: 1 }],
    trial_period_days: TRIAL_PERIOD_DAYS,
    metadata: {
      ...(userId ? { userId } : {}),
      houseType,
      tier,
      billingInterval,
    },
  };
  return idempotencyKey
    ? stripe.subscriptions.create(params, { idempotencyKey })
    : stripe.subscriptions.create(params);
};

export const createItemsFromMetadata = (
  subscriptionMetdata: OperatorSubscription,
): Stripe.SubscriptionCreateParams.Item[] => {
  const numHouses = Object.keys(subscriptionMetdata.houses).length;
  let numGuests = 0;
  Object.keys(subscriptionMetdata.houses).forEach((houseId) => {
    const house = subscriptionMetdata.houses[houseId];
    numGuests += house.numberOfGuests;
  });
  const housePlanId = subscriptionMetdata.oxfordEnabled
    ? OXFORD_PRICE_ID
    : planIds.house;
  return [
    {
      plan: housePlanId,
      quantity: numHouses,
    },
    {
      plan: planIds.guest,
      quantity: numGuests,
    },
  ];
};

export const reactivateSubscription = async (
  customerId: string,
  subscriptionMetadata: OperatorSubscription,
  userId?: string,
): Promise<OperatorSubscription> => {
  // Tier model: recreate a single flat-fee line item from the stored tier, and
  // record the single subscriptionItemId. Legacy two-item subscriptions keep the
  // house+guest createItemsFromMetadata path unchanged below.
  if (subscriptionMetadata.tier) {
    const houseType = subscriptionMetadata.houseType as HouseType;
    const tier = subscriptionMetadata.tier as TierKey;
    const price = resolveTierPriceId(houseType, tier);
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price, quantity: 1 }],
      ...(userId ? { metadata: { userId } } : {}),
    });
    const freshMetadata = new OperatorSubscription();
    freshMetadata.houseType = houseType;
    freshMetadata.tier = tier;
    freshMetadata.maxResidents = subscriptionMetadata.maxResidents;
    freshMetadata.maxProperties = subscriptionMetadata.maxProperties;
    freshMetadata.houses = subscriptionMetadata.houses ?? {};
    mapSubscriptionToMetadata(subscription, freshMetadata, customerId);
    freshMetadata.subscriptionItemId = subscription.items.data[0].id;
    return freshMetadata;
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: createItemsFromMetadata(subscriptionMetadata),
    ...(userId ? { metadata: { userId } } : {}),
  });
  const freshMetadata = new OperatorSubscription();
  freshMetadata.oxfordEnabled = subscriptionMetadata.oxfordEnabled;
  mapSubscriptionToMetadata(subscription, freshMetadata, customerId);
  const housePriceId = subscriptionMetadata.oxfordEnabled
    ? OXFORD_PRICE_ID
    : planIds.house;
  subscription.items.data.forEach((item) => {
    if (item.plan.id === planIds.guest) {
      freshMetadata.items.guestItemId = item.id;
    }
    if (item.plan.id === housePriceId) {
      freshMetadata.items.houseItemId = item.id;
    }
  });
  return freshMetadata;
};

export const retrieveSubscription = async (id: string) => {
  return stripe.subscriptions.retrieve(id);
};

export const retrieveCustomer = async (
  id: string,
): Promise<Stripe.Customer> => {
  const customer = await stripe.customers.retrieve(id);
  if (customer.deleted) {
    throw new Error(`Customer ${id} has been deleted`);
  }
  return customer;
};

export const retrievePaymentMethod = async (customerId: string) => {
  try {
    const customer: Stripe.Customer = await retrieveCustomer(customerId);
    const paymentMethod = customer.invoice_settings.default_payment_method;
    return stripe.paymentMethods.retrieve(paymentMethod as string);
  } catch (error) {
    logger.error("Could not retrieve payment method", error);
  }
  return null;
};

export const getSubscriptionItem = async (id: string) => {
  return stripe.subscriptionItems.retrieve(id);
};

export const updateSubscription = async (
  id: string,
  params: Stripe.SubscriptionUpdateParams,
) => {
  return stripe.subscriptions.update(id, params);
};

export const updateSubscriptionItem = async (
  itemId: string,
  _type: keyof typeof planIds,
  quantity: number,
) => {
  // Omit `plan` from the update so Stripe preserves the item's existing price.
  // Passing `plan` here would silently downgrade Oxford ($79) items to house ($49).
  return stripe.subscriptionItems.update(itemId, { quantity });
};

/**
 * Swaps the price on a subscription item. Used exclusively by setOxfordEnabled
 * to toggle between the house plan and the Oxford plan. Unlike updateSubscriptionItem,
 * this deliberately passes `price` because the entire point is to change the plan tier.
 */
export const swapSubscriptionItemPrice = async (
  itemId: string,
  newPriceId: string,
): Promise<Stripe.SubscriptionItem> => {
  return stripe.subscriptionItems.update(itemId, { price: newPriceId });
};

// An Oxford price swap must land on a price with the same billing interval as
// the subscription already has, or an annual plan silently becomes monthly.
// Read it from Stripe: a stored field would be one more thing to keep in sync.
export const getSubscriptionItemInterval = async (
  itemId: string,
): Promise<"month" | "year"> => {
  const item = await stripe.subscriptionItems.retrieve(itemId);
  return item.price?.recurring?.interval === "year" ? "year" : "month";
};

export const updateHouseSubscriptionAmount = async (
  itemId: string,
  quantity: number,
) => {
  return updateSubscriptionItem(itemId, "house", quantity);
};

export const updateGuestSubscriptionAmount = async (
  itemId: string,
  quantity: number,
) => {
  return updateSubscriptionItem(itemId, "guest", quantity);
};

/**
 * Applies the appropriate bundle coupon to a Stripe subscription based on
 * house count. If no discount tier is reached, removes any existing coupon.
 *
 * Coupon tiers:
 *   houseCount >= 5  → regroup-bundle-5  (20% off, forever)
 *   houseCount >= 3  → regroup-bundle-3  (10% off, forever)
 *   houseCount < 3   → no coupon (removes any existing one)
 */
export const applyBundleDiscountToSubscription = async (
  subscriptionId: string,
  houseCount: number,
): Promise<void> => {
  const couponId = getBundleCoupon(houseCount);
  if (couponId) {
    await stripe.subscriptions.update(subscriptionId, {
      discounts: [{ coupon: couponId }],
    });
  } else {
    await removeBundleDiscount(subscriptionId);
  }
};

/**
 * Removes any discount currently applied to a Stripe subscription.
 * Passing an empty array clears all subscription-level discounts.
 */
export const removeBundleDiscount = async (
  subscriptionId: string,
): Promise<void> => {
  await stripe.subscriptions.update(subscriptionId, { discounts: [] });
};

export const mapSubscriptionToMetadata = (
  subscription: Stripe.Subscription,
  metadata: OperatorSubscription,
  customerId: string,
) => {
  // For trialing subscriptions, trial_end is the authoritative period boundary.
  // For active subscriptions, current_period_end is not available at the
  // subscription level in this API version — billing_cycle_anchor is the closest
  // proxy; webhook handlers should overwrite currentPeriodEnd on billing events.
  const periodEnd =
    subscription.status === "trialing" && subscription.trial_end != null
      ? subscription.trial_end
      : subscription.billing_cycle_anchor;
  metadata.currentPeriodEnd = periodEnd * 1000;
  metadata.subscriptionId = subscription.id;
  metadata.customerId = customerId;
};

export const initializeSubscription = async (
  customerId: string,
  oxfordEnabled: boolean = false,
  userId?: string,
): Promise<OperatorSubscription> => {
  const subscription = await createSubscription(
    customerId,
    oxfordEnabled,
    userId,
  );
  const subscriptionMetadata = new OperatorSubscription();
  subscriptionMetadata.oxfordEnabled = oxfordEnabled;
  mapSubscriptionToMetadata(subscription, subscriptionMetadata, customerId);
  const housePriceId = oxfordEnabled ? OXFORD_PRICE_ID : planIds.house;
  subscription.items.data.forEach((item) => {
    if (item.plan.id === planIds.guest) {
      subscriptionMetadata.items.guestItemId = item.id;
    }
    if (item.plan.id === housePriceId) {
      subscriptionMetadata.items.houseItemId = item.id;
    }
  });
  return subscriptionMetadata;
};

export const initializeCustomer = async (
  email: string,
  paymentMethod: string,
  oxfordEnabled: boolean = false,
  userId?: string,
) => {
  const customer = await createCustomer(email, paymentMethod);
  // Throws (and deletes the customer) before any subscription exists if the card
  // is unusable. The trial means signup itself never charges, so this is the only
  // point at which a dead card can be caught. See api/cardValidation.ts.
  await assertPaymentMethodUsable(stripe, customer.id, paymentMethod);
  return initializeSubscription(customer.id, oxfordEnabled, userId);
};

/**
 * Tier-model customer initialization. Mirrors initializeCustomer but creates a
 * single-item flat-fee tier subscription and returns the single
 * subscriptionItemId (there is no separate house/guest item in the tier model).
 */
export const initializeTierCustomer = async (
  email: string,
  paymentMethod: string,
  houseType: HouseType,
  tier: TierKey,
  userId: string,
  billingInterval: BillingInterval = "month",
) => {
  // Without these keys a retry or double-submit creates a SECOND real customer
  // and subscription; Firestore keeps whichever finishes last, orphaning the
  // other to bill forever with nothing pointing at it.
  const day = idempotencyDay();
  const customer = await createCustomer(
    email,
    paymentMethod,
    `cust-${userId}-${day}`,
  );
  // Same guard as the legacy path: validate before the subscription exists.
  await assertPaymentMethodUsable(stripe, customer.id, paymentMethod);
  const subscription = await createTierSubscription(
    customer.id,
    houseType,
    tier,
    userId,
    billingInterval,
    // Tier and interval are part of the key: changing plan is a new operation,
    // not a retry of the old one.
    `tiersub-${userId}-${houseType}-${tier}-${billingInterval}-${day}`,
  );
  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    subscriptionItemId: subscription.items.data[0].id,
    status: subscription.status,
    houseType,
    tier,
    billingInterval,
    oxfordEnabled: houseType === "oxford",
  };
};

export const updateSubscriptionMetadata = (
  user: User,
  houseId: string,
  action: "add" | "remove",
  houseIds: string[],
  forHouse: boolean = false,
) => {
  if (!forHouse) {
    const currentGuests =
      user.subscriptionMetadata.houses[houseId]?.numberOfGuests ?? 0;
    return {
      ...user.subscriptionMetadata,
      houses: {
        ...user.subscriptionMetadata.houses,
        [houseId]: {
          numberOfGuests:
            action === "add"
              ? currentGuests + 1
              : Math.max(0, currentGuests - 1),
        },
      },
    };
  } else {
    if (action === "add") {
      const houseEntry: Record<string, { numberOfGuests: number }> = {};
      if (houseIds && houseIds.length) {
        houseIds.forEach((id) => {
          houseEntry[id] = {
            numberOfGuests: 0,
          };
        });
      }
      if (houseId) {
        houseEntry[houseId] = {
          numberOfGuests: 0,
        };
      }
      return {
        ...user.subscriptionMetadata,
        houses: {
          ...user.subscriptionMetadata.houses,
          ...houseEntry,
        },
      };
    } else {
      // Immutable removal — spread creates a new houses object without houseId.
      // delete on a shallow copy would mutate the original houses reference.
      const { [houseId]: _removed, ...remainingHouses } =
        user.subscriptionMetadata.houses;
      return {
        ...user.subscriptionMetadata,
        houses: remainingHouses,
      };
    }
  }
};
