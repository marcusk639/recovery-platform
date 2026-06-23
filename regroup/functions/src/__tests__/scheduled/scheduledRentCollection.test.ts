import { runRentCollection } from "../../scheduled/scheduledRentCollection";

const mockCreatePaymentIntent = jest.fn();
const mockPaymentMethodsRetrieve = jest.fn();

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
            rentOwed: 500,
          }),
        },
        {
          id: "guest-2",
          data: () => ({
            houseId: "house-1",
            stripeCustomerId: "cus_test2",
            defaultPaymentMethodId: "pm_test2",
            autoPayEnabled: true,
            rentOwed: 750,
          }),
        },
      ],
    }),
  },
}));

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreatePaymentIntent },
    paymentMethods: { retrieve: mockPaymentMethodsRetrieve },
  }));
});

// Mock config to provide secret name + the rent-fee model used by the helper.
jest.mock("../../config", () => ({
  STRIPE_SECRET_KEY: { name: "STRIPE_SECRET_KEY" },
  LEGACY_RENT_FEE_HOUSE_IDS: [],
  RENT_FEE: {
    achFlatCents: 200,
    achRate: 0,
    achCapCents: 300,
    cardPlatformRate: 0.0075,
    legacyRate: 0.02,
  },
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

  describe("method-aware Connect application fee", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { guestCollection } = require("../../api/firestore");

    const seedConnectGuest = (overrides: Record<string, unknown>) => {
      guestCollection.get.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [
          {
            id: "guest-c",
            data: () => ({
              houseId: "house-1",
              stripeCustomerId: "cus_c",
              defaultPaymentMethodId: "pm_c",
              stripeConnectId: "acct_dest",
              autoPayEnabled: true,
              rentOwed: 10000, // $100.00
              ...overrides,
            }),
          },
        ],
      });
    };

    it("charges the 0.75% card platform fee when the default method is a card", async () => {
      seedConnectGuest({});
      mockPaymentMethodsRetrieve.mockResolvedValue({ type: "card" });
      mockCreatePaymentIntent.mockResolvedValue({
        id: "pi_c",
        status: "succeeded",
      });

      await runRentCollection();

      expect(mockPaymentMethodsRetrieve).toHaveBeenCalledWith("pm_c");
      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 75, // 0.75% of 10000
          transfer_data: { destination: "acct_dest" },
        }),
        expect.anything(),
      );
    });

    it("charges the flat ACH fee when the default method is a bank account", async () => {
      seedConnectGuest({});
      mockPaymentMethodsRetrieve.mockResolvedValue({ type: "us_bank_account" });
      mockCreatePaymentIntent.mockResolvedValue({
        id: "pi_c",
        status: "succeeded",
      });

      await runRentCollection();

      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ application_fee_amount: 200 }), // flat $2
        expect.anything(),
      );
    });
  });
});
