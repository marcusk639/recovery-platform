/**
 * Tests for MemberModel — focusing on privacy defaults.
 *
 * Critical invariant: showSobrietyDate and showPhoneNumber must default
 * to FALSE (opt-in privacy) when the Firestore document is missing these
 * fields. Defaulting to true leaks personal recovery information.
 */

import {MemberModel} from '../MemberModel';

// Global mocks from jest.setup.js handle Firebase modules

describe('MemberModel privacy defaults', () => {
  it('fromFirestore: showSobrietyDate defaults to false when field missing', () => {
    const doc = {
      id: 'group1_user1',
      data: () => ({
        userId: 'user1',
        groupId: 'group1',
        displayName: 'John D',
        // showSobrietyDate intentionally absent
        // showPhoneNumber intentionally absent
      }),
    } as any;

    const member = MemberModel.fromFirestore(doc);
    expect(member.showSobrietyDate).toBe(false);
    expect(member.showPhoneNumber).toBe(false);
  });

  it('fromFirestore: preserves explicit true when field is present', () => {
    const doc = {
      id: 'group1_user1',
      data: () => ({
        userId: 'user1',
        groupId: 'group1',
        displayName: 'John D',
        showSobrietyDate: true,
        showPhoneNumber: true,
      }),
    } as any;

    const member = MemberModel.fromFirestore(doc);
    expect(member.showSobrietyDate).toBe(true);
    expect(member.showPhoneNumber).toBe(true);
  });

  it('fromFirestore: preserves explicit false when field is present', () => {
    const doc = {
      id: 'group1_user1',
      data: () => ({
        userId: 'user1',
        groupId: 'group1',
        displayName: 'John D',
        showSobrietyDate: false,
        showPhoneNumber: false,
      }),
    } as any;

    const member = MemberModel.fromFirestore(doc);
    expect(member.showSobrietyDate).toBe(false);
    expect(member.showPhoneNumber).toBe(false);
  });
});
