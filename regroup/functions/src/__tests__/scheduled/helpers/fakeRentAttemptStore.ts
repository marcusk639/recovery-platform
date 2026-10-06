/**
 * In-memory stand-in for the `rent-collection-attempts` collection, with the
 * two semantics the repeat-charge guard depends on: `create()` rejects
 * ALREADY_EXISTS, and a `where('period','==',…)` read sees everything written
 * by earlier runs.
 *
 * Shared by the rent-collection test suites so neither has to carry it.
 */

/** Records Stripe-vs-Firestore call ordering across a run. */
export const callOrder: string[] = [];

export class FakeRentAttemptStore {
  docs = new Map<string, Record<string, unknown>>();
  failUpdate = false;
  failCreate = false;

  reset(): void {
    this.docs.clear();
    this.failUpdate = false;
    this.failCreate = false;
    callOrder.length = 0;
  }

  doc(id: string) {
    const store = this;
    return {
      id,
      create: async (data: Record<string, unknown>) => {
        callOrder.push(`create:${id}`);
        if (store.failCreate) {
          throw new Error('firestore unavailable');
        }
        if (store.docs.has(id)) {
          const err = new Error(`6 ALREADY_EXISTS: entity already exists: ${id}`) as Error & {
            code: number;
          };
          err.code = 6;
          throw err;
        }
        store.docs.set(id, { ...data });
      },
      update: async (data: Record<string, unknown>) => {
        callOrder.push(`update:${id}`);
        if (store.failUpdate) {
          throw new Error('firestore unavailable');
        }
        store.docs.set(id, { ...(store.docs.get(id) ?? {}), ...data });
      },
    };
  }

  where(field: string, _op: string, value: unknown) {
    const store = this;
    return {
      get: async () => {
        const matched = [...store.docs.entries()].filter(([, data]) => data[field] === value);
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
