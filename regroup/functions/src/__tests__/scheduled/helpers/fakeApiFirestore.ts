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
