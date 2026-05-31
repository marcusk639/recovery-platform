import type { Invitation, InvitationType } from '../Invite';

// Invite.tsx only exports TypeScript interfaces/type aliases (no concrete classes),
// so we test structural conformance by constructing plain objects that satisfy the types.

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invite-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: 'guest',
    houseId: 'house-1',
    inviterId: 'inviter-1',
    email: 'new@example.com',
    initialPhase: 'Phase 1',
    expirationDate: new Date('2026-12-31'),
    ownerId: 'owner-1',
    ...overrides,
  };
}

describe('Invitation interface structural conformance', () => {
  it('constructs a valid Invitation object without errors', () => {
    expect(() => makeInvitation()).not.toThrow();
  });

  it('has an id field', () => {
    const inv = makeInvitation();
    expect(inv.id).toBe('invite-1');
  });

  it('has a type field', () => {
    const inv = makeInvitation();
    expect(inv.type).toBe('guest');
  });

  it('has a houseId field', () => {
    const inv = makeInvitation();
    expect(inv.houseId).toBe('house-1');
  });

  it('has an inviterId field', () => {
    const inv = makeInvitation();
    expect(inv.inviterId).toBe('inviter-1');
  });

  it('has an email field', () => {
    const inv = makeInvitation();
    expect(inv.email).toBe('new@example.com');
  });

  it('has an initialPhase field', () => {
    const inv = makeInvitation();
    expect(inv.initialPhase).toBe('Phase 1');
  });

  it('has an expirationDate field that is a Date', () => {
    const inv = makeInvitation();
    expect(inv.expirationDate).toBeInstanceOf(Date);
  });

  it('has an ownerId field', () => {
    const inv = makeInvitation();
    expect(inv.ownerId).toBe('owner-1');
  });

  it('has a createdAt field', () => {
    const inv = makeInvitation();
    expect(typeof inv.createdAt).toBe('string');
  });

  it('has an updatedAt field', () => {
    const inv = makeInvitation();
    expect(typeof inv.updatedAt).toBe('string');
  });
});

describe('InvitationType union', () => {
  const validTypes: InvitationType[] = ['guest', 'admin', 'superAdmin', 'supporter', 'senior-peer'];

  it('accepts "guest" as a valid InvitationType', () => {
    const inv = makeInvitation({ type: 'guest' });
    expect(inv.type).toBe('guest');
  });

  it('accepts "admin" as a valid InvitationType', () => {
    const inv = makeInvitation({ type: 'admin' });
    expect(inv.type).toBe('admin');
  });

  it('accepts "superAdmin" as a valid InvitationType', () => {
    const inv = makeInvitation({ type: 'superAdmin' });
    expect(inv.type).toBe('superAdmin');
  });

  it('accepts "supporter" as a valid InvitationType', () => {
    const inv = makeInvitation({ type: 'supporter' });
    expect(inv.type).toBe('supporter');
  });

  it('accepts "senior-peer" as a valid InvitationType', () => {
    const inv = makeInvitation({ type: 'senior-peer' });
    expect(inv.type).toBe('senior-peer');
  });

  it('has exactly 5 valid invitation types', () => {
    expect(validTypes).toHaveLength(5);
  });
});

describe('Invitation overrides', () => {
  it('allows email to be overridden', () => {
    const inv = makeInvitation({ email: 'other@example.com' });
    expect(inv.email).toBe('other@example.com');
  });

  it('allows expirationDate to be a future date', () => {
    const future = new Date('2030-06-15T12:00:00Z');
    const inv = makeInvitation({ expirationDate: future });
    expect(inv.expirationDate.getUTCFullYear()).toBe(2030);
    expect(inv.expirationDate.getUTCMonth()).toBe(5); // June = 5
  });

  it('allows houseId to be overridden', () => {
    const inv = makeInvitation({ houseId: 'house-xyz' });
    expect(inv.houseId).toBe('house-xyz');
  });

  it('optional uid field can be set (from BaseEntity)', () => {
    const inv = makeInvitation({ uid: 'some-uid' });
    expect(inv.uid).toBe('some-uid');
  });
});
