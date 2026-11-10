// A refunded rent payment puts the refunded amount back on the balance, once
// per refunded cent (#198; owner decision 2026-11-09).
jest.mock("firebase-admin", () => ({
  firestore: { FieldValue: { increment: (n: number) => ({ __increment: n }) } },
}));
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

import { restoreRefundedRent } from "../../webhooks/refundRestore";

type Doc = Record<string, any>;

// Just enough Firestore for one transaction: get, update and set (merge).
function fakeDb(docs: Record<string, Doc>) {
  const ref = (path: string) => ({ path });
  const apply = (path: string, data: Doc) => {
    const target = (docs[path] = docs[path] ?? {});
    for (const [key, value] of Object.entries(data)) {
      target[key] =
        value && typeof value === "object" && "__increment" in value
          ? (target[key] ?? 0) + value.__increment
          : value;
    }
  };
  return {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (txn: any) => Promise<any>) =>
      fn({
        get: async ({ path }: { path: string }) => ({
          exists: path in docs,
          get: (field: string) => docs[path]?.[field],
        }),
        update: ({ path }: { path: string }, data: Doc) => apply(path, data),
        set: ({ path }: { path: string }, data: Doc) => apply(path, data),
      }),
  } as any;
}

const rentPayment = (extra: Doc = {}): Record<string, Doc> => ({
  "payments/pi_1": {
    guestId: "g1",
    amount: 15000,
    rentApplied: true,
    rentAppliedAmountCents: 15000,
    ...extra,
  },
  "guests/g1": { rentOwed: 0 },
});

describe("restoreRefundedRent (#198)", () => {
  it("puts a full refund back on the balance", async () => {
    const docs = rentPayment();
    expect(await restoreRefundedRent(fakeDb(docs), "pi_1", 15000)).toBe(15000);
    expect(docs["guests/g1"].rentOwed).toBe(15000);
    expect(docs["payments/pi_1"].refundRestoredCents).toBe(15000);
  });

  it("restores once when the same refund event arrives twice", async () => {
    const docs = rentPayment();
    const db = fakeDb(docs);
    await restoreRefundedRent(db, "pi_1", 15000);
    expect(await restoreRefundedRent(db, "pi_1", 15000)).toBe(0);
    expect(docs["guests/g1"].rentOwed).toBe(15000);
  });

  it("restores a partial refund, then only the rest of a later one", async () => {
    const docs = rentPayment();
    const db = fakeDb(docs);
    expect(await restoreRefundedRent(db, "pi_1", 5000)).toBe(5000);
    expect(await restoreRefundedRent(db, "pi_1", 15000)).toBe(10000);
    expect(docs["guests/g1"].rentOwed).toBe(15000);
  });

  it("never restores more than the payment took off the balance", async () => {
    const docs = rentPayment({ rentAppliedAmountCents: 10000 });
    expect(await restoreRefundedRent(fakeDb(docs), "pi_1", 15000)).toBe(10000);
    expect(docs["guests/g1"].rentOwed).toBe(10000);
  });

  it("leaves the balance alone for a payment that never lowered rent", async () => {
    const docs = rentPayment({ rentApplied: undefined });
    expect(await restoreRefundedRent(fakeDb(docs), "pi_1", 15000)).toBe(0);
    expect(docs["guests/g1"].rentOwed).toBe(0);
  });

  it("does nothing, without throwing, when the payment doc doesn't exist yet", async () => {
    const docs: Record<string, Doc> = { "guests/g1": { rentOwed: 0 } };
    expect(await restoreRefundedRent(fakeDb(docs), "pi_1", 15000)).toBe(0);
    expect(docs["guests/g1"].rentOwed).toBe(0);
  });
});
