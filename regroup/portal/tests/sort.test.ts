import { sortRows } from '../src/app/sort';

const rows = [{ v: 2 }, { v: null }, { v: 1 }];
test('sorts both ways, with unknown values last either way', () => {
  expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, null]);
  expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([2, 1, null]);
});
test('does not change the array it was given', () => {
  sortRows(rows, (r) => r.v, 'asc');
  expect(rows[0].v).toBe(2);
});
test('sorts text ignoring case', () => {
  const names = [{ v: 'beta' }, { v: 'Alpha' }];
  expect(sortRows(names, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['Alpha', 'beta']);
});
