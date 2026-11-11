const mockTxGet = jest.fn();
const mockTxUpdate = jest.fn();
const mockDoc = jest.fn((id: string) => ({ path: `users/${id}` }));

jest.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: () => ({ doc: mockDoc }),
    runTransaction: (fn: (tx: unknown) => unknown) =>
      fn({ get: mockTxGet, update: mockTxUpdate }),
  }),
}));
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

import type Stripe from "stripe";
import { syncOperatorTier } from "../../webhooks/syncOperatorTier";

const mockRetrieve = jest.fn();
const stripe = { subscriptions: { retrieve: mockRetrieve } } as unknown as Stripe;

/** What Stripe says the subscription is now. */
const stripeHas = (...items: { id: string; price: string }[]) =>
  mockRetrieve.mockResolvedValue({
    id: "sub_1",
    items: { data: items.map((i) => ({ id: i.id, price: { id: i.price } })) },
  });

const operatorWith = (meta: Record<string, unknown>) =>
  mockTxGet.mockResolvedValue({ data: () => ({ subscriptionMetadata: meta }) });

const starterOperator = {
  subscriptionId: "sub_1",
  subscriptionItemId: "si_1",
  houseType: "traditional",
  tier: "starter",
  maxResidents: 10,
  maxProperties: 1,
};

describe("syncOperatorTier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_pro";
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL = "price_pro_year";
    process.env.STRIPE_PRICE_OXFORD_PLUS = "price_plus";
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL;
    delete process.env.STRIPE_PRICE_OXFORD_PLUS;
  });

  it("an upgrade in the portal moves the operator to the new tier and its limits", async () => {
    operatorWith(starterOperator);
    stripeHas({ id: "si_1", price: "price_pro" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockRetrieve).toHaveBeenCalledWith("sub_1");
    expect(mockTxUpdate).toHaveBeenCalledWith(
      { path: "users/uid_1" },
      {
        "subscriptionMetadata.tier": "professional",
        "subscriptionMetadata.billingInterval": "month",
        "subscriptionMetadata.maxResidents": 20,
        "subscriptionMetadata.maxProperties": 3,
      },
    );
  });

  it("a downgrade lowers the limits", async () => {
    operatorWith({ ...starterOperator, tier: "professional", maxResidents: 20, maxProperties: 3 });
    stripeHas({ id: "si_1", price: "price_starter" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "subscriptionMetadata.tier": "starter",
        "subscriptionMetadata.maxResidents": 10,
        "subscriptionMetadata.maxProperties": 1,
      }),
    );
  });

  it("a switch to annual billing records the interval", async () => {
    operatorWith(starterOperator);
    stripeHas({ id: "si_1", price: "price_pro_year" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "subscriptionMetadata.billingInterval": "year" }),
    );
  });

  it("follows Stripe's current price, so a late event for an earlier plan can't put it back", async () => {
    // The event that triggered this carried the old starter price; Stripe now has Professional.
    operatorWith({ ...starterOperator, tier: "professional", maxResidents: 20, maxProperties: 3 });
    stripeHas({ id: "si_1", price: "price_pro" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "subscriptionMetadata.tier": "professional" }),
    );
  });

  it("reads the operator's own item when the subscription has more than one", async () => {
    operatorWith({ ...starterOperator, subscriptionItemId: "si_tier" });
    stripeHas({ id: "si_addon", price: "price_unknown" }, { id: "si_tier", price: "price_pro" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "subscriptionMetadata.tier": "professional" }),
    );
  });

  it("leaves the operator alone when the price matches no tier", async () => {
    operatorWith(starterOperator);
    stripeHas({ id: "si_1", price: "price_unknown" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("leaves a price in the other catalog to setOxfordEnabled, which also changes the houses", async () => {
    operatorWith(starterOperator);
    stripeHas({ id: "si_1", price: "price_plus" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("ignores an event for a subscription the operator no longer has", async () => {
    operatorWith({ ...starterOperator, subscriptionId: "sub_new" });
    stripeHas({ id: "si_1", price: "price_pro" });

    await syncOperatorTier(stripe, "uid_1", "sub_1");

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});
