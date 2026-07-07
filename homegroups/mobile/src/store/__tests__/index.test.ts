import {store} from '../index';

describe('production store configuration', () => {
  it('registers a reducer for every known slice, including intergroup and branding', () => {
    const expectedKeys = [
      'auth',
      'groups',
      'transactions',
      'treasury',
      'meetings',
      'announcements',
      'members',
      'chat',
      'servicePositions',
      'sponsorship',
      'reports',
      'treasurerHandoff',
      'businessMeetings',
      'directMessages',
      'dashboard',
      'adminRemoval',
      'recurringTransactions',
      'engagement',
      'referral',
      'stepWork',
      'reflections',
      'literature',
      'groupResources',
      'groupHealth',
      'intergroup',
      'branding',
    ];
    const actualKeys = Object.keys(store.getState());
    for (const key of expectedKeys) {
      expect(actualKeys).toContain(key);
    }
  });
});
