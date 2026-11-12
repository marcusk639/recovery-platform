import { balanceLabel, currentResidents, matchesName, phaseLabel, roomOf, tableStateFor } from '../src/app/residents/rows';

const rooms = {
  '2A': { id: '2A', beds: { b1: { id: 'b1', guestId: 'g1' } } },
  '3B': { id: '3B', beds: { b2: { id: 'b2', guestId: null } } },
};

test("finds a resident's room", () => {
  expect(roomOf(rooms, 'g1')).toBe('2A');
  expect(roomOf(rooms, 'g2')).toBeNull();
  expect(roomOf({}, 'g1')).toBeNull();
  expect(roomOf(undefined, 'g1')).toBeNull();
});
test('discharged residents are left out, as on the phone', () => {
  const list = currentResidents({ a: { id: 'a', status: 'active' }, b: { id: 'b', status: 'discharged' } });
  expect(list.map((g) => g.id)).toEqual(['a']);
});
test('the name filter ignores case and matches either name', () => {
  const bob = { firstName: 'Bob', lastName: 'Rivera' };
  expect(matchesName(bob, 'riv')).toBe(true);
  expect(matchesName(bob, 'BOB R')).toBe(true);
  expect(matchesName(bob, 'alice')).toBe(false);
  expect(matchesName(bob, '  ')).toBe(true);
});
test('a balance is money or says it cannot be read', () => {
  expect(balanceLabel(15000)).toBe('$150.00');
  expect(balanceLabel(undefined)).toBe('$0.00');
  expect(balanceLabel('15000')).toBe("Can't read");
  expect(balanceLabel(NaN)).toBe("Can't read");
});
test('a custom phase has a name, not a document id', () => {
  expect(phaseLabel({ id: 'g1', phase: 'g1' })).toBe('Custom');
  expect(phaseLabel({ id: 'g1', phase: 'Phase 2' })).toBe('Phase 2');
  expect(phaseLabel({ id: 'g1', phase: 2 })).toBe('2');
  expect(phaseLabel({ id: 'g1', phase: '' })).toBe('No phase');
});
test('sort and filter are kept per house', () => {
  const one = tableStateFor('h1');
  one.filter = 'riv';
  expect(tableStateFor('h1').filter).toBe('riv');
  expect(tableStateFor('h2').filter).toBe('');
});
