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

const subscription = (priceId: string, id = "sub_1") =>
  ({ id, items: { data: [{ price: { id: priceId } }] } }) as unknown as Stripe.Subscription;

const operatorWith = (meta: Record<string, unknown>) =>
  mockTxGet.mockResolvedValue({ data: () => ({ subscriptionMetadata: meta }) });

describe("syncOperatorTier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_pro";
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
    delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
  });

  it("an upgrade in the portal moves the operator to the new tier and its limits", async () => {
    operatorWith({ subscriptionId: "sub_1", tier: "starter", houseType: "traditional", maxResidents: 10, maxProperties: 1 });

    await syncOperatorTier("uid_1", subscription("price_pro"));

    expect(mockTxUpdate).toHaveBeenCalledWith(
      { path: "users/uid_1" },
      {
        "subscriptionMetadata.houseType": "traditional",
        "subscriptionMetadata.tier": "professional",
        "subscriptionMetadata.billingInterval": "month",
        "subscriptionMetadata.oxfordEnabled": false,
        "subscriptionMetadata.maxResidents": 20,
        "subscriptionMetadata.maxProperties": 3,
      },
    );
  });

  it("a downgrade lowers the limits", async () => {
    operatorWith({ subscriptionId: "sub_1", tier: "professional", houseType: "traditional", maxResidents: 20, maxProperties: 3 });

    await syncOperatorTier("uid_1", subscription("price_starter"));

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "subscriptionMetadata.tier": "starter",
        "subscriptionMetadata.maxResidents": 10,
        "subscriptionMetadata.maxProperties": 1,
      }),
    );
  });

  it("leaves the operator alone when the price matches no tier", async () => {
    operatorWith({ subscriptionId: "sub_1", tier: "starter" });

    await syncOperatorTier("uid_1", subscription("price_unknown"));

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("ignores an event for a subscription the operator no longer has", async () => {
    operatorWith({ subscriptionId: "sub_new", tier: "starter" });

    await syncOperatorTier("uid_1", subscription("price_pro", "sub_old"));

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});
