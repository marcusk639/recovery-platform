// canCreateHouses mirrors the server createHouses entitlement gate
// (assertCanCreateHouses + operatorStatusToHouseStatus in regroup/functions):
// a tier, and a status that maps to an active or trialing house.
import { canCreateHouses } from '../setup-plan-gate';

describe('canCreateHouses', () => {
  it.each([
    ['active', true],
    ['trialing', true],
    ['cancelling', true], // still billing until period end
    ['past_due', false],
    ['unpaid', false],
    ['canceled', false],
    ['pending', false],
    ['', false],
    [undefined, false],
  ])('status %p with a tier → %p', (status, expected) => {
    expect(canCreateHouses({ tier: 'starter', status } as any)).toBe(expected);
  });

  it.each([
    ['no metadata', undefined],
    ['null metadata', null],
    ['no tier', { status: 'active' }],
    ['empty tier', { status: 'active', tier: '' }],
  ])('denies %s', (_l, meta) => {
    expect(canCreateHouses(meta as any)).toBe(false);
  });
});
