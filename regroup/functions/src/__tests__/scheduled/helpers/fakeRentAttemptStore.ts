/**
 * In-memory stand-in for the `rent-collection-attempts` collection.
 *
 * Models the two things the in-flight guard depends on: `doc()` with no
 * arguments mints a fresh id (Firestore auto-id — never a sequential key), and
 * `where('status','in',[...])` sees every document earlier runs wrote.
 *
 * Shared by the rent-collection suites so neither has to carry it.
 */

/** Records Stripe-vs-Firestore call ordering across a run. */
export const callOrder: string[] = [];

export class FakeRentAttemptStore {
  docs = new Map<string, Record<string, unknown>>();
  failCreate = false;
  failUpdate = false;
  /** Ids handed out by doc(), in order, so tests can assert on shape. */
  mintedIds: string[] = [];
  private seq = 0;

  reset(): void {
    this.docs.clear();
    this.failCreate = false;
    this.failUpdate = false;
    this.mintedIds = [];
    this.seq = 0;
    callOrder.length = 0;
  }

  /** Seed an attempt as if an earlier run had written it. */
  seedAttempt(data: Record<string, unknown>): string {
    const id = `seeded-${this.docs.size}`;
    this.docs.set(id, { ...data });
    return id;
  }

  doc(id?: string) {
    const store = this;
    // Mimics Firestore: no argument means "mint an id for me".
    const docId = id ?? `auto-${(this.seq += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    if (id === undefined) {
      this.mintedIds.push(docId);
    }

    return {
      id: docId,
      create: async (data: Record<string, unknown>) => {
        callOrder.push('firestore:create');
        if (store.failCreate) {
          throw new Error('firestore unavailable');
        }
        store.docs.set(docId, { ...data });
      },
      update: async (data: Record<string, unknown>) => {
        callOrder.push('firestore:update');
        if (store.failUpdate) {
          throw new Error('firestore unavailable');
        }
        store.docs.set(docId, { ...(store.docs.get(docId) ?? {}), ...data });
      },
    };
  }

  where(field: string, op: string, value: unknown) {
    const store = this;
    return {
      get: async () => {
        const matched = [...store.docs.entries()].filter(([, data]) =>
          op === 'in' ? (value as unknown[]).includes(data[field]) : data[field] === value,
        );
        return {
          empty: matched.length === 0,
          size: matched.length,
          docs: matched.map(([id, data]) => ({ id, data: () => data })),
        };
      },
    };
  }
}

/** A guest doc shaped the way scheduledRentCollection reads it. */
export const fakeGuestDoc = (id: string, rentOwed: number) => ({
  id,
  data: () => ({
    houseId: 'house-1',
    stripeCustomerId: `cus_${id}`,
    defaultPaymentMethodId: `pm_${id}`,
    autoPayEnabled: true,
    rentOwed,
  }),
});

/** A Stripe card decline — deterministic, no money moved. */
export const cardDecline = () => {
  const err = new Error('Your card was declined.') as Error & { type: string };
  err.type = 'StripeCardError';
  return err;
};
