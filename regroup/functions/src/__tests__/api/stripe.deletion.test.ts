// src/__tests__/api/stripe.deletion.test.ts
//
// Mocks the `stripe` npm package directly (same convention as reactivate.test.ts).

const mockSubscriptionsCancel = jest.fn();
const mockCustomersDel = jest.fn();

jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    },
    customers: {
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
  })),
);

import { cancelSubscriptionNow, deleteCustomer } from "../../api/stripe";

const missingError = () =>
  Object.assign(new Error("No such resource"), {
    type: "StripeInvalidRequestError",
    code: "resource_missing",
  });

describe("Stripe deletion helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test";
  });

  it("cancels a subscription immediately", async () => {
    mockSubscriptionsCancel.mockResolvedValue({ id: "sub_1" });
    await expect(cancelSubscriptionNow("sub_1")).resolves.toBeUndefined();
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_1");
  });

  it("treats a missing subscription as already cancelled", async () => {
    mockSubscriptionsCancel.mockRejectedValue(missingError());
    await expect(cancelSubscriptionNow("sub_gone")).resolves.toBeUndefined();
  });

  it("deletes a customer", async () => {
    mockCustomersDel.mockResolvedValue({ id: "cus_1", deleted: true });
    await expect(deleteCustomer("cus_1")).resolves.toBeUndefined();
    expect(mockCustomersDel).toHaveBeenCalledWith("cus_1");
  });

  it("treats a missing customer as already deleted", async () => {
    mockCustomersDel.mockRejectedValue(missingError());
    await expect(deleteCustomer("cus_gone")).resolves.toBeUndefined();
  });

  it("rethrows other Stripe errors", async () => {
    const err = Object.assign(new Error("boom"), {
      type: "StripeAPIError",
      code: "api_error",
    });
    mockSubscriptionsCancel.mockRejectedValue(err);
    mockCustomersDel.mockRejectedValue(err);
    await expect(cancelSubscriptionNow("sub_1")).rejects.toBe(err);
    await expect(deleteCustomer("cus_1")).rejects.toBe(err);
  });
});
