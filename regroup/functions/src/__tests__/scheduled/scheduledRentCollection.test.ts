import { runRentCollection } from "../../scheduled/scheduledRentCollection";

const mockCreatePaymentIntent = jest.fn();

jest.mock("../../api/firestore", () => ({
  guestCollection: {
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: false,
      size: 2,
      docs: [
        {
          id: "guest-1",
          data: () => ({
            houseId: "house-1",
            stripeCustomerId: "cus_test1",
            defaultPaymentMethodId: "pm_test1",
            autoPayEnabled: true,
            balance: 500,
          }),
        },
        {
          id: "guest-2",
          data: () => ({
            houseId: "house-1",
            stripeCustomerId: "cus_test2",
            defaultPaymentMethodId: "pm_test2",
            autoPayEnabled: true,
            balance: 750,
          }),
        },
      ],
    }),
  },
}));

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreatePaymentIntent },
  }));
});

// Mock config to provide secret name
jest.mock("../../config", () => ({
  STRIPE_SECRET_KEY: { name: "STRIPE_SECRET_KEY" },
}));

describe("runRentCollection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });

  it("creates a PaymentIntent for each auto-pay guest with balance", async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: "pi_test",
      status: "succeeded",
    });

    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: expect.any(Number),
        currency: "usd",
        confirm: true,
        off_session: true,
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("auto-rent-guest-1"),
      })
    );
  });

  it("continues processing when one payment fails", async () => {
    mockCreatePaymentIntent
      .mockRejectedValueOnce(new Error("card_declined"))
      .mockResolvedValueOnce({ id: "pi_test2", status: "succeeded" });

    await expect(runRentCollection()).resolves.not.toThrow();
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
  });
});
