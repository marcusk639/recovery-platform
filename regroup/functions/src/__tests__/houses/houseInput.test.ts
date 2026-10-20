import { encode } from 'ngeohash';
import { buildHouseDoc, createHouseInputSchema } from '../../houses/houseInput';

const ctx = {
  houseId: 'ServerDerivedId00001',
  ownerUid: 'owner-uid',
  adminId: 'admin-id',
  subscriptionStatus: 'trialing' as const,
  now: '2026-10-20T00:00:00.000Z',
};
const base = {
  requestKey: 'local-wizard_id-1',
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
    expect(doc.stripeStatus).toBe('not_connected');
    expect(doc.currentCapacity).toBe(0);
    expect(doc.imageUrl).toBe('');
    expect(doc.avatar).toBe('');
    expect(doc.createdAt).toBe(ctx.now);
  });

  it('passes the wizard-collected certified flag through, defaulting to false', () => {
    expect(build({ certified: true }).certified).toBe(true);
    expect(build({ certified: false }).certified).toBe(false);
    expect(build().certified).toBe(false);
    expect(createHouseInputSchema.safeParse({ ...base, certified: 'yes' }).success).toBe(false);
  });

  it('seeds the collections legacy client-created houses carried', () => {
    expect(build()).toMatchObject({
      issues: {},
      complaints: {},
      disputes: {},
      applications: {},
      health: {},
      awaitingVerification: [],
    });
    // Not client-writable: the schema strips them.
    expect(build({ issues: { x: 1 }, awaitingVerification: ['x'] })).toMatchObject({
      issues: {},
      awaitingVerification: [],
    });
  });

  it('range-checks coordinates after numeric coercion', () => {
    const ok = (lat: unknown, lng: unknown) =>
      createHouseInputSchema.safeParse({ ...base, lat, lng }).success;
    expect(ok(90, 180)).toBe(true);
    expect(ok(-90, -180)).toBe(true);
    expect(ok('-90', '180')).toBe(true);
    expect(ok(90.0001, 0)).toBe(false);
    expect(ok(-91, 0)).toBe(false);
    expect(ok('91', 0)).toBe(false);
    expect(ok(0, 180.5)).toBe(false);
    expect(ok(0, '-181')).toBe(false);
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

  it('rejects a requestKey that is not 1-64 chars of [A-Za-z0-9_-]', () => {
    const parse = (requestKey: unknown) =>
      createHouseInputSchema.safeParse({ ...base, requestKey }).success;
    expect(parse('../users/x')).toBe(false);
    expect(parse('a:b')).toBe(false);
    expect(parse('')).toBe(false);
    expect(parse('x'.repeat(65))).toBe(false);
    expect(parse(undefined)).toBe(false);
    expect(parse('x'.repeat(64))).toBe(true);
    expect(parse('Ab_9-z')).toBe(true);
  });

  it('strips a client-sent id; the doc id comes from the server context', () => {
    const parsed = createHouseInputSchema.parse({ ...base, id: 'aaaaaaaaaaaaaaaaaaa1' });
    expect(parsed).not.toHaveProperty('id');
    const doc = buildHouseDoc(parsed, ctx);
    expect(doc.id).toBe(ctx.houseId);
    expect(doc).not.toHaveProperty('requestKey');
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
