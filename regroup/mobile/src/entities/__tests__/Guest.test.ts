jest.mock('../../services/guest', () => ({
  createGuestId: () => 'test-guest-id',
}));

import { Guest } from '../Guest';

describe('Guest entity', () => {
  it('should not have embedded week objects', () => {
    const guest = new Guest();
    expect(guest).not.toHaveProperty('currentWeek');
    expect(guest).not.toHaveProperty('previousWeek');
    expect(guest).not.toHaveProperty('nextWeek');
  });

  it('should have required identity fields', () => {
    const guest = new Guest();
    expect(guest).toHaveProperty('id');
    expect(guest).toHaveProperty('userId');
    expect(guest).toHaveProperty('houseId');
    expect(guest).toHaveProperty('status');
  });

  it('uses BaseEntity createdAt/updatedAt, not redeclared createdDate/lastUpdated', () => {
    const guest = new Guest();
    expect(typeof guest.createdAt).toBe('string');
    expect(typeof guest.updatedAt).toBe('string');
    const ownKeys = Object.getOwnPropertyNames(guest);
    expect(ownKeys).not.toContain('createdDate');
    expect(ownKeys).not.toContain('lastUpdated');
    expect(ownKeys.filter(k => k === 'moveOutDate').length).toBeLessThanOrEqual(
      1,
    );
  });
});
