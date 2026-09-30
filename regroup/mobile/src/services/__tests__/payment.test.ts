/**
 * Unit tests for the payment service.
 *
 * Firebase modules are mocked via the automatic module mock provided by
 * __mocks__/firebase-setup.js (mapped by jest.config moduleNameMapper).
 *
 * Design notes:
 * - `paymentsCollection` is created once at module load time.  Tests that
 *   need to inspect or override the collection's query chain access the mocked
 *   methods through the imported `firestore` reference.
 * - Because `firestore.collection()` returns a fixed mock object (the same
 *   reference each time), we configure its child mocks (where, orderBy, get)
 *   per test using mockImplementation / mockResolvedValueOnce.
 */

// No jest.mock needed here — firebase-setup is auto-mocked via moduleNameMapper

// recordManualPayment uses FirebaseFirestore.FieldValue.increment directly
// (imported from @react-native-firebase/firestore, not the firebase-setup
// instance) — mocked the same way activity.test.ts does, with a sentinel
// object the assertions below can recognize.
jest.mock("@react-native-firebase/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { firestore, functions } from "../../../firebase-setup";
import {
  createRentPaymentIntent,
  recordRentPayment,
  recordManualPayment,
  paymentIntentIdFromClientSecret,
  getPaymentHistory,
  RentPayment,
} from "../payments";

// ─── Typed helpers ────────────────────────────────────────────────────────────

const mockFirestore = firestore as any;
const mockFunctions = functions as any;

// The payment service uses `firestore.collection('payments')` at module load.
// The auto-mock returns the same collection object each time, so we grab it.
const collectionMock =
  mockFirestore.collection.mock?.results?.[0]?.value ??
  mockFirestore.collection("payments");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("payment service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore chaining behaviour after clearAllMocks clears implementations
    if (collectionMock.where) {
      collectionMock.where.mockImplementation(function (this: any) {
        return collectionMock;
      });
    }
    if (collectionMock.orderBy) {
      collectionMock.orderBy.mockImplementation(function (this: any) {
        return collectionMock;
      });
    }
    if (collectionMock.get) {
      collectionMock.get.mockResolvedValue({ docs: [] });
    }
  });

  // ── createRentPaymentIntent ───────────────────────────────────────────────

  describe("createRentPaymentIntent", () => {
    it("calls the createPaymentIntent Cloud Function (not createRentPaymentIntent)", async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({
          data: {
            clientSecret: "pi_abc_secret",
            paymentUrl: "https://stripe.com/pay/abc",
            paymentIntentId: "pi_abc",
          },
        })
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createRentPaymentIntent({ guestId: "guest1", houseId: "house1", amountInCents: 150 });

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
        "createPaymentIntent"
      );
    });

    it("propagates errors from the Cloud Function", async () => {
      const failCallable = jest.fn(() =>
        Promise.reject(new Error("functions/not-found"))
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

      await expect(
        createRentPaymentIntent({ guestId: "guest1", houseId: "house1", amountInCents: 150 })
      ).rejects.toThrow("functions/not-found");
    });

    it("returns the correct shape for a successful response", async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({
          data: {
            clientSecret: "cs_test",
            paymentUrl: "https://stripe.com/pay/test",
            paymentIntentId: "pi_test",
          },
        })
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createRentPaymentIntent({ guestId: "g1", houseId: "h1", amountInCents: 200 });
      expect(result).toEqual({
        clientSecret: "cs_test",
        paymentUrl: "https://stripe.com/pay/test",
        paymentIntentId: "pi_test",
      });
    });
  });

  // ── recordRentPayment ─────────────────────────────────────────────────────

  describe("recordRentPayment", () => {
    /**
     * Wires `firestore.runTransaction` so the callback receives a fake
     * transaction whose `.get(docRef)` resolves to `existingData` (or a
     * non-existent snapshot when omitted), and captures `.set` calls.
     */
    function setupTransaction(existingData?: Partial<RentPayment>) {
      const transactionSet = jest.fn();
      const transactionGet = jest.fn(() =>
        Promise.resolve(
          existingData
            ? { exists: true, data: () => existingData }
            : { exists: false, data: () => null }
        )
      );
      mockFirestore.runTransaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) =>
          callback({ get: transactionGet, set: transactionSet })
      );
      return { transactionSet, transactionGet };
    }

    it("writes a pending payment document via a transaction, merged", async () => {
      const mockDocRef = { id: "new-payment-id" };
      collectionMock.doc = jest.fn(() => mockDocRef);
      const { transactionSet } = setupTransaction();

      const result = await recordRentPayment(
        "guest1",
        "house1",
        150,
        "Monthly Rent",
        "pi_test_123"
      );

      expect(transactionSet).toHaveBeenCalledTimes(1);
      const [docRefArg, written, options] = transactionSet.mock.calls[0];
      expect(docRefArg).toBe(mockDocRef);
      expect(options).toEqual({ merge: true });
      expect(written.guestId).toBe("guest1");
      expect(written.houseId).toBe("house1");
      expect(written.amount).toBe(150);
      expect(written.status).toBe("pending");
      expect(written.description).toBe("Monthly Rent");
      expect(written.stripePaymentIntentId).toBe("pi_test_123");
      expect(result.id).toBe("new-payment-id");
    });

    it('uses "Rent Payment" as default description when none provided', async () => {
      collectionMock.doc = jest.fn(() => ({ id: "pay-id" }));
      const { transactionSet } = setupTransaction();

      await recordRentPayment("g1", "h1", 100);

      const written = transactionSet.mock.calls[0][1];
      expect(written.description).toBe("Rent Payment");
    });

    it("returns the full RentPayment object", async () => {
      collectionMock.doc = jest.fn(() => ({ id: "pay-xyz" }));
      setupTransaction();

      const result = await recordRentPayment("g1", "h1", 75, "Chore Fee");
      expect(result).toMatchObject({
        id: "pay-xyz",
        guestId: "g1",
        houseId: "h1",
        amount: 75,
        status: "pending",
        description: "Chore Fee",
      });
    });

    it("includes a createdAt ISO timestamp", async () => {
      collectionMock.doc = jest.fn(() => ({ id: "ts-id" }));
      setupTransaction();

      const result = await recordRentPayment("g1", "h1", 200);
      expect(typeof result.createdAt).toBe("string");
      expect(() => new Date(result.createdAt)).not.toThrow();
    });

    it("writes to payments/{stripePaymentIntentId} when a PaymentIntent ID is given, so the webhook's merge lands on this exact doc", async () => {
      const mockDocFn = jest.fn(() => ({ id: "pi_abc123" }));
      collectionMock.doc = mockDocFn;
      setupTransaction();

      await recordRentPayment("g1", "h1", 200, "Rent", "pi_abc123");

      expect(mockDocFn).toHaveBeenCalledWith("pi_abc123");
    });

    it("falls back to an auto-generated doc ID when no PaymentIntent ID is given", async () => {
      const mockDocFn = jest.fn(() => ({ id: "auto-id" }));
      collectionMock.doc = mockDocFn;
      setupTransaction();

      await recordRentPayment("g1", "h1", 200);

      expect(mockDocFn).toHaveBeenCalledWith();
    });

    // Regression coverage for 2026-07-07: a plain (non-transactional,
    // non-merge) set() used to let this optimistic client write clobber a
    // webhook that already landed and marked the payment "succeeded" —
    // downgrading it back to "pending" and wiping any webhook-only fields.
    describe("when the webhook already landed first", () => {
      it("does not downgrade an already-succeeded payment back to pending", async () => {
        collectionMock.doc = jest.fn(() => ({ id: "pi_race" }));
        const { transactionSet } = setupTransaction({
          id: "pi_race",
          guestId: "guest1",
          houseId: "house1",
          amount: 150,
          status: "succeeded",
          createdAt: "2026-07-01T00:00:00.000Z",
          receiptUrl: "https://stripe.com/receipt/abc",
        } as any);

        const result = await recordRentPayment(
          "guest1",
          "house1",
          150,
          "Rent",
          "pi_race"
        );

        expect(transactionSet).not.toHaveBeenCalled();
        expect(result.status).toBe("succeeded");
        expect((result as any).receiptUrl).toBe(
          "https://stripe.com/receipt/abc"
        );
      });

      it("still writes when the existing record is itself still pending", async () => {
        collectionMock.doc = jest.fn(() => ({ id: "pi_still_pending" }));
        const { transactionSet } = setupTransaction({
          id: "pi_still_pending",
          guestId: "guest1",
          houseId: "house1",
          amount: 150,
          status: "pending",
          createdAt: "2026-07-01T00:00:00.000Z",
        } as any);

        await recordRentPayment(
          "guest1",
          "house1",
          150,
          "Rent",
          "pi_still_pending"
        );

        expect(transactionSet).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── paymentIntentIdFromClientSecret ───────────────────────────────────────

  describe("paymentIntentIdFromClientSecret", () => {
    it("extracts the PaymentIntent ID prefix from a client secret", () => {
      expect(paymentIntentIdFromClientSecret("pi_3Nx8_secret_abcXYZ")).toBe(
        "pi_3Nx8"
      );
    });
  });

  // ── recordManualPayment ────────────────────────────────────────────────────

  describe("recordManualPayment", () => {
    function setupBatch() {
      const batchSet = jest.fn();
      const batchUpdate = jest.fn();
      const batchCommit = jest.fn(() => Promise.resolve());
      mockFirestore.batch.mockReturnValue({
        set: batchSet,
        update: batchUpdate,
        commit: batchCommit,
      });
      return { batchSet, batchUpdate, batchCommit };
    }

    it("decrements the guest's rentOwed by the payment amount, in the same batch as the payment doc write", async () => {
      const mockPaymentDocRef = { id: "manual-1" };
      collectionMock.doc = jest.fn(() => mockPaymentDocRef);

      const guestDocRef = { id: "g1" };
      const guestsCollectionMock = { doc: jest.fn(() => guestDocRef) };
      const originalCollection = mockFirestore.collection;
      mockFirestore.collection = jest.fn((name: string) =>
        name === "guests" ? guestsCollectionMock : collectionMock
      );
      const { batchSet, batchUpdate, batchCommit } = setupBatch();

      try {
        await recordManualPayment("g1", "h1", 15000, "Cash");

        expect(guestsCollectionMock.doc).toHaveBeenCalledWith("g1");
        expect(batchSet).toHaveBeenCalledWith(
          mockPaymentDocRef,
          expect.objectContaining({ amount: 15000 })
        );
        expect(batchUpdate).toHaveBeenCalledWith(guestDocRef, {
          rentOwed: { __increment: -15000 },
        });
        // Both writes must be queued before the single commit — this is
        // what makes the payment doc + rentOwed decrement atomic.
        expect(batchCommit).toHaveBeenCalledTimes(1);
      } finally {
        mockFirestore.collection = originalCollection;
      }
    });
  });

  // ── getPaymentHistory ─────────────────────────────────────────────────────

  describe("getPaymentHistory", () => {
    it("returns an empty array when no payment documents exist", async () => {
      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() => Promise.resolve({ docs: [] }));

      const result = await getPaymentHistory("guest1");
      expect(result).toEqual([]);
    });

    it("returns mapped payment objects from Firestore docs", async () => {
      const mockPayments: RentPayment[] = [
        {
          id: "p1",
          guestId: "guest1",
          houseId: "house1",
          amount: 150,
          status: "succeeded",
          createdAt: "2026-02-01T00:00:00.000Z",
          description: "Monthly Rent",
        },
        {
          id: "p2",
          guestId: "guest1",
          houseId: "house1",
          amount: 25,
          status: "pending",
          createdAt: "2026-02-15T00:00:00.000Z",
          description: "Chore Fee",
        },
      ];

      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({
          docs: mockPayments.map((p) => ({ data: () => p })),
        })
      );

      const result = await getPaymentHistory("guest1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("p1");
      expect(result[0].status).toBe("succeeded");
      expect(result[1].id).toBe("p2");
      expect(result[1].description).toBe("Chore Fee");
    });

    it("queries by guestId and orders by createdAt desc", async () => {
      const whereMock = jest.fn(() => collectionMock);
      const orderByMock = jest.fn(() => collectionMock);
      collectionMock.where = whereMock;
      collectionMock.orderBy = orderByMock;
      collectionMock.get = jest.fn(() => Promise.resolve({ docs: [] }));

      await getPaymentHistory("guest42");

      expect(whereMock).toHaveBeenCalledWith("guestId", "==", "guest42");
      expect(orderByMock).toHaveBeenCalledWith("createdAt", "desc");
    });

    it("returns payment with correct shape including optional fields", async () => {
      const mockPayment: RentPayment = {
        id: "p3",
        guestId: "guest1",
        houseId: "house1",
        amount: 500,
        status: "failed",
        createdAt: "2026-01-20T00:00:00.000Z",
        stripePaymentIntentId: "pi_failed_123",
      };

      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({ docs: [{ data: () => mockPayment }] })
      );

      const result = await getPaymentHistory("guest1");
      expect(result[0].stripePaymentIntentId).toBe("pi_failed_123");
      expect(result[0].status).toBe("failed");
    });

    it("handles a single payment document correctly", async () => {
      const payment: RentPayment = {
        id: "solo",
        guestId: "g1",
        houseId: "h1",
        amount: 300,
        status: "succeeded",
        createdAt: "2026-01-10T00:00:00.000Z",
      };
      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({ docs: [{ data: () => payment }] })
      );

      const result = await getPaymentHistory("g1");
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(300);
    });
  });
});
