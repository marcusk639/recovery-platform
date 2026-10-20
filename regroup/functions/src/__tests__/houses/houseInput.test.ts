import { encode } from 'ngeohash';
import { buildHouseDoc, createHouseInputSchema } from '../../houses/houseInput';

const ctx = {
  ownerUid: 'owner-uid',
  adminId: 'admin-id',
  subscriptionStatus: 'trialing' as const,
  now: '2026-10-20T00:00:00.000Z',
};
const base = {
  id: 'abcdefghij0123456789',
  name: 'Maple House',
  lat: 30.2672,
  lng: -97.7431,
};
const build = (extra: Record<string, unknown> = {}) =>
  buildHouseDoc(createHouseInputSchema.parse({ ...base, ...extra }), ctx);

describe('houseInput', () => {
  it('drops server-owned fields from client input', () => {
    const doc = build({
      subscriptionStatus: 'active',
      stripeAccountId: 'acct_x',
      ownerId: 'evil',
      isDemoHouse: true,
      oxfordEnabled: true,
      adminIds: ['evil'],
      superAdminIds: ['evil'],
      certified: true,
      guestGraceEndsAt: 'x',
      stripeAccountApi: 'v2',
      stripeStatus: 'active',
    });
    expect(doc.ownerId).toBe(ctx.ownerUid);
    expect(doc).not.toHaveProperty('stripeAccountId');
    expect(doc).not.toHaveProperty('stripeAccountApi');
    expect(doc).not.toHaveProperty('guestGraceEndsAt');
    expect(doc.isDemoHouse).toBe(false);
    expect(doc).not.toHaveProperty('oxfordEnabled');
    expect(doc.subscriptionStatus).toBe(ctx.subscriptionStatus);
    expect(doc.adminIds).toEqual(['admin-id']);
    expect(doc.superAdminIds).toEqual(['admin-id']);
    expect(doc.certified).toBe(false);
    expect(doc.stripeStatus).toBe('not_connected');
    expect(doc.currentCapacity).toBe(0);
    expect(doc.imageUrl).toBe('');
    expect(doc.avatar).toBe('');
    expect(doc.createdAt).toBe(ctx.now);
  });

  it('sets superAdminId to the operator uid, ignoring client input', () => {
    // callable/oxford.ts and callable/analytics.ts authorize on
    // house.superAdminId === request.auth.uid; nothing else writes it.
    expect(build({ superAdminId: 'evil' }).superAdminId).toBe(ctx.ownerUid);
  });

  it('computes geohash on the server', () => {
    expect(build({ geohash: 'evil' }).geohash).toBe(encode(30.2672, -97.7431));
    expect(build({ lat: '30.2672', lng: '-97.7431' }).geohash).toBe(encode(30.2672, -97.7431));
  });

  it('rejects an id that is not a 20-char auto-id', () => {
    expect(createHouseInputSchema.safeParse({ ...base, id: '../users/x' }).success).toBe(false);
  });

  it('rejects missing name and non-numeric coordinates', () => {
    expect(createHouseInputSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(createHouseInputSchema.safeParse({ ...base, lat: 'abc' }).success).toBe(false);
  });

  it('keeps wizard configuration', () => {
    const cfg = {
      phases: { a: { name: 'Phase 1' } },
      chores: { c: { name: 'Dishes' } },
      rooms: { r: { beds: 2 } },
      pendingGuestInvites: ['g@x.com'],
      managerSetupType: 'senior-peer',
    };
    const doc = build(cfg);
    expect(doc).toMatchObject(cfg);
  });
});
