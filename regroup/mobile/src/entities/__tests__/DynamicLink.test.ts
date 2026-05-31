import type { DynamicLink } from '../DynamicLink';
import type { InvitationType } from '../Invite';

function makeDynamicLink(overrides: Partial<DynamicLink> = {}): DynamicLink {
  return {
    type: 'invitation',
    house: 'house-001',
    invitationType: 'guest',
    email: 'invitee@example.com',
    ...overrides,
  };
}

describe('DynamicLink interface structural conformance', () => {
  it('constructs a minimal valid DynamicLink without errors', () => {
    expect(() => makeDynamicLink()).not.toThrow();
  });

  it('type is always "invitation"', () => {
    const link = makeDynamicLink();
    expect(link.type).toBe('invitation');
  });

  it('house field holds a house id string', () => {
    const link = makeDynamicLink({ house: 'house-xyz' });
    expect(link.house).toBe('house-xyz');
  });

  it('invitationType accepts "guest"', () => {
    const link = makeDynamicLink({ invitationType: 'guest' });
    expect(link.invitationType).toBe('guest');
  });

  it('invitationType accepts "admin"', () => {
    const link = makeDynamicLink({ invitationType: 'admin' });
    expect(link.invitationType).toBe('admin');
  });

  it('invitationType accepts "superAdmin"', () => {
    const link = makeDynamicLink({ invitationType: 'superAdmin' });
    expect(link.invitationType).toBe('superAdmin');
  });

  it('invitationType accepts "supporter"', () => {
    const link = makeDynamicLink({ invitationType: 'supporter' });
    expect(link.invitationType).toBe('supporter');
  });

  it('invitationType accepts "senior-peer"', () => {
    const link = makeDynamicLink({ invitationType: 'senior-peer' });
    expect(link.invitationType).toBe('senior-peer');
  });

  it('email field holds an email address string', () => {
    const link = makeDynamicLink({ email: 'user@test.com' });
    expect(link.email).toBe('user@test.com');
  });

  it('inviter is optional and can be set', () => {
    const link = makeDynamicLink({ inviter: 'user-admin-001' });
    expect(link.inviter).toBe('user-admin-001');
  });

  it('inviter is optional and defaults to undefined', () => {
    const link = makeDynamicLink();
    expect(link.inviter).toBeUndefined();
  });

  it('initialPhase is optional and can be set', () => {
    const link = makeDynamicLink({ initialPhase: 'Phase 1' });
    expect(link.initialPhase).toBe('Phase 1');
  });

  it('initialPhase is optional and defaults to undefined', () => {
    const link = makeDynamicLink();
    expect(link.initialPhase).toBeUndefined();
  });

  it('userId is optional and can be set', () => {
    const link = makeDynamicLink({ userId: 'user-abc' });
    expect(link.userId).toBe('user-abc');
  });

  it('userId is optional and defaults to undefined', () => {
    const link = makeDynamicLink();
    expect(link.userId).toBeUndefined();
  });

  it('owner is optional and can be set', () => {
    const link = makeDynamicLink({ owner: 'owner-999' });
    expect(link.owner).toBe('owner-999');
  });

  it('owner is optional and defaults to undefined', () => {
    const link = makeDynamicLink();
    expect(link.owner).toBeUndefined();
  });

  it('all optional fields can be set simultaneously', () => {
    const link = makeDynamicLink({
      inviter: 'inv-001',
      initialPhase: 'Phase 2',
      userId: 'user-002',
      owner: 'owner-003',
    });
    expect(link.inviter).toBe('inv-001');
    expect(link.initialPhase).toBe('Phase 2');
    expect(link.userId).toBe('user-002');
    expect(link.owner).toBe('owner-003');
  });

  it('two DynamicLinks are independent objects', () => {
    const l1 = makeDynamicLink({ house: 'house-A', email: 'a@test.com' });
    const l2 = makeDynamicLink({ house: 'house-B', email: 'b@test.com' });
    expect(l1.house).not.toBe(l2.house);
    expect(l1.email).not.toBe(l2.email);
  });
});
