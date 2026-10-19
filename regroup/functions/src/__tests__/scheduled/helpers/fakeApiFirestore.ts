/**
 * A chainable stand-in for a Firestore CollectionReference holding no
 * documents.
 *
 * Deliberately NOT a no-op. Suites that mock '../../api/firestore' and then
 * call runRentCollection() walk the real call path, so a stub that cannot
 * respond to count()/select() would make those suites pass while proving
 * nothing about whether the daily job reaches the collection at all.
 */
export function fakeEmptyCollection(): { where: jest.Mock } {
  const where: jest.Mock = jest.fn().mockReturnValue({
    // Self-chaining: reportPaymentsNeedingReconciliation chains two .where()
    // calls, so the first must return something that answers .where() again.
    get where() {
      return where;
    },
    count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
    select: () => ({ limit: () => ({ get: async () => ({ size: 0, docs: [] }) }) }),
  });
  return { where };
}

/**
 * A stand-in for `houseCollection` in which every house can receive rent: an
 * active Stripe account named after the house id (`acct_<houseId>`).
 *
 * Autopay resolves each guest's destination from the house, so suites that are
 * not about routing still need houses that exist and are connected. Suites that
 * are about routing build their own.
 */
export function fakeActiveHouseCollection(): { doc: jest.Mock } {
  return {
    doc: jest.fn((id: string) => ({
      get: jest.fn(async () => ({
        exists: true,
        data: () => ({ stripeAccountId: `acct_${id}`, stripeStatus: 'active' }),
      })),
    })),
  };
}
