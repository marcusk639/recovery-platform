// previewRentCharges: what each current resident would be charged if the house turned
// rent charging on with this schedule and price (rent spec §5: "turning charging on
// shows a preview first"). It computes with the same anchor and charge rule as the
// job, writes nothing, and is for managers and above only (spec §2, §4.7).
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
  HttpsError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

type Data = Record<string, unknown>;
const mockDocs: Record<string, Data | undefined> = {};
const mockGuests: Array<{ id: string; data: Data; createdMs: number }> = [];
const mockWrites: string[] = [];
const snap = (path: string) => ({
  id: path.split('/')[1],
  exists: !!mockDocs[path],
  data: () => mockDocs[path],
});
const ref = (collection: string) => (id: string) => ({
  path: `${collection}/${id}`,
  get: async () => snap(`${collection}/${id}`),
  set: () => mockWrites.push(`${collection}/${id}`),
  update: () => mockWrites.push(`${collection}/${id}`),
});
jest.mock('../../api/firestore', () => ({
  houseCollection: { doc: ref('houses') },
  rentHouseStateCollection: { doc: ref('rentHouseStates') },
  rentAccountCollection: { doc: ref('rentAccounts') },
  guestCollection: {
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: mockGuests
          .filter((g) => g.data[field] === value)
          .map((g) => ({
            id: g.id,
            data: () => g.data,
            createTime: { toMillis: () => g.createdMs },
          })),
      }),
    }),
  },
  ratsFirestore: {
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snap(r.path)),
  },
}));

const mockTiers: Record<string, string> = {};
jest.mock('../../util/houseRoles', () => ({
  houseTierOf: async (uid: string, houseId: string) => mockTiers[`${houseId}_${uid}`] ?? 'none',
}));

import { logger } from 'firebase-functions';
import { previewRentCharges } from '../../callable/previewRentCharges';

const call = (uid: string | null, data: unknown) =>
  (previewRentCharges as any)({ auth: uid ? { uid } : undefined, data });

// Wednesday 2026-11-18, 12:00 in New York.
const NOW = new Date('2026-11-18T17:00:00.000Z');
const LONG_AGO = Date.parse('2026-10-01T12:00:00.000Z');

const guest = (id: string, data: Data, createdMs = LONG_AGO) =>
  mockGuests.push({
    id,
    createdMs,
    data: { houseId: 'h1', status: 'active', firstName: 'Pat', lastName: id, ...data },
  });

describe('previewRentCharges', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    for (const k of Object.keys(mockDocs)) delete mockDocs[k];
    for (const k of Object.keys(mockTiers)) delete mockTiers[k];
    mockGuests.length = 0;
    mockWrites.length = 0;
    mockDocs['houses/h1'] = {
      houseType: 'traditional',
      timezone: 'America/New_York',
      rentFrequency: 'both',
    };
    mockTiers.h1_manager = 'manager';
    mockTiers.h1_owner = 'owner';
    mockTiers.h1_peer = 'peerLeader';
    mockTiers.h1_res = 'resident';
  });
  afterEach(() => jest.useRealTimers());

  it('existing residents are charged $0 now, with their first charge the next Monday', async () => {
    guest('gA', { moveInDate: '2026-10-01' });
    const out = await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 });
    expect(out.residents).toEqual([
      {
        guestId: 'gA',
        label: 'Pat gA',
        nowCents: 0,
        firstDay: '2026-11-23',
        amountCents: 17500,
        daysCovered: 7,
        daysInPeriod: 7,
        rateSource: 'house',
      },
    ]);
  });

  it('$175 weekly for a resident moving in on a later Wednesday: 12500 cents, 5 of 7', async () => {
    guest('gB', { moveInDate: '2026-11-25' });
    const [row] = (await call('owner', { houseId: 'h1', frequency: 'weekly', price: 175 }))
      .residents;
    expect(row).toMatchObject({
      firstDay: '2026-11-25',
      amountCents: 12500,
      daysCovered: 5,
      daysInPeriod: 7,
      nowCents: 0,
    });
  });

  it('turning charging back on on a Wednesday resumes that day for a resident charged before: 12500 now', async () => {
    guest('gC', { moveInDate: '2026-11-01' });
    mockDocs['rentAccounts/gC'] = {
      guestId: 'gC',
      houseId: 'h1',
      houseJoinedAtMs: LONG_AGO,
      joinedOn: '2026-11-01',
      reactivatedOn: null,
      anchoredTo: '2026-11-02',
      chargeFrom: '2026-11-02',
      chargedThrough: '2026-11-08',
      chargedHouseId: 'h1',
    };
    const [row] = (await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 }))
      .residents;
    expect(row).toMatchObject({
      firstDay: '2026-11-18',
      amountCents: 12500,
      daysCovered: 5,
      daysInPeriod: 7,
      nowCents: 12500,
    });
  });

  it("uses the house's timezone: Sunday night in Los Angeles is still last week there", async () => {
    // Monday 01:00 in New York, Sunday 22:00 in Los Angeles.
    jest.setSystemTime(new Date('2026-11-23T06:00:00.000Z'));
    mockDocs['houses/h1'] = { ...mockDocs['houses/h1'], timezone: 'America/Los_Angeles' };
    guest('gA', { moveInDate: '2026-10-01' });
    const [row] = (await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 }))
      .residents;
    // In New York the next Monday would be Nov 30.
    expect(row.firstDay).toBe('2026-11-23');
  });

  it('a monthly price of $800 for existing residents starts on the 1st, at the full $800', async () => {
    guest('gA', { moveInDate: '2026-10-01' });
    const [row] = (await call('manager', { houseId: 'h1', frequency: 'monthly', price: 800 }))
      .residents;
    expect(row).toMatchObject({
      firstDay: '2026-12-01',
      amountCents: 80000,
      daysCovered: 31,
      daysInPeriod: 31,
    });
  });

  it("uses a resident's custom rate only when it was set for the chosen schedule", async () => {
    guest('gW', {
      moveInDate: '2026-10-01',
      customRent: { amountCents: 12000, frequency: 'weekly' },
    });
    guest('gM', {
      moveInDate: '2026-10-01',
      customRent: { amountCents: 60000, frequency: 'monthly' },
    });
    const weekly = await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 });
    const byId = Object.fromEntries(weekly.residents.map((r: Data) => [r.guestId, r]));
    expect(byId.gW).toMatchObject({ amountCents: 12000, rateSource: 'custom' });
    // $600/month must never become $600/week (Review Focus 5).
    expect(byId.gM).toMatchObject({ amountCents: 17500, rateSource: 'house' });
  });

  it('leaves out discharged, moved-out and linked intake records', async () => {
    guest('gA', { moveInDate: '2026-10-01' });
    guest('gGone', { status: 'discharged' });
    guest('gOut', { moveOutDate: '2026-11-01' });
    guest('gLinked', { rentLinkedTo: 'gA' });
    guest('gElsewhere', { houseId: 'h2' });
    const out = await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 });
    expect(out.residents.map((r: Data) => r.guestId)).toEqual(['gA']);
  });

  it('writes nothing and logs no names', async () => {
    guest('gA', { moveInDate: '2026-10-01' });
    await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 });
    expect(mockWrites).toEqual([]);
    const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain('Pat');
  });

  it.each(['peer', 'res', 'stranger'])('refuses %s with permission-denied', async (uid) => {
    await expect(
      call(uid, { houseId: 'h1', frequency: 'weekly', price: 175 }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a caller who is not signed in', async () => {
    await expect(
      call(null, { houseId: 'h1', frequency: 'weekly', price: 175 }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['cents typed as dollars', { frequency: 'weekly', price: 17500 }],
    ['zero', { frequency: 'weekly', price: 0 }],
    ['a string', { frequency: 'weekly', price: '175' }],
    ['charging off', { frequency: 'both', price: 175 }],
    ['a monthly price above $10,000', { frequency: 'monthly', price: 10001 }],
  ])('refuses %s with invalid-argument', async (_label, input) => {
    await expect(call('manager', { houseId: 'h1', ...input })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('refuses an Oxford house: it pays the equal expense share, never a price', async () => {
    mockDocs['houses/h1'] = { ...mockDocs['houses/h1'], houseType: 'oxford' };
    await expect(
      call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses a house that does not exist', async () => {
    mockTiers.h9_manager = 'manager';
    await expect(
      call('manager', { houseId: 'h9', frequency: 'weekly', price: 175 }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // Rent spec §4.3: "Weekly, charged through Sun Nov 15, switches to $800/month:
  // Nov 16 to 30, 15 of 30, $400.00 on Nov 16".
  it('a weekly house charged through Sun Nov 15 switching to $800/month: $400.00 for Nov 16-30', async () => {
    jest.setSystemTime(new Date('2026-11-16T15:00:00.000Z'));
    mockDocs['houses/h1'] = { ...mockDocs['houses/h1'], rentFrequency: 'weekly', weeklyRent: 175 };
    mockDocs['rentHouseStates/h1'] = {
      startDate: '2026-11-02',
      startedAtMs: Date.parse('2026-11-02T15:00:00.000Z'),
    };
    guest('gA', { moveInDate: '2026-10-01' });
    mockDocs['rentAccounts/gA'] = {
      guestId: 'gA',
      houseId: 'h1',
      houseJoinedAtMs: LONG_AGO,
      joinedOn: '2026-10-01',
      reactivatedOn: null,
      anchoredTo: '2026-11-02',
      chargeFrom: '2026-11-09',
      chargedThrough: '2026-11-15',
      chargedHouseId: 'h1',
    };
    const out = await call('manager', { houseId: 'h1', frequency: 'monthly', price: 800 });
    expect(out.residents[0]).toMatchObject({
      firstDay: '2026-11-16',
      amountCents: 40000,
      daysCovered: 15,
      daysInPeriod: 30,
      nowCents: 40000,
    });
  });

  it('counts, without listing, a resident whose own rate is above the limit (the job skips them too)', async () => {
    guest('gA', { moveInDate: '2026-10-01' });
    guest('gBad', { moveInDate: '2026-10-01', customRent: { amountCents: 300000, frequency: 'weekly' } });
    const out = await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 });
    expect(out.residents.map((r: Data) => r.guestId)).toEqual(['gA']);
    expect(out.skipped).toBe(1);
  });

  it('while charging is already on, keeps the existing start: a resident charged through Sunday is next charged Monday', async () => {
    mockDocs['houses/h1'] = { ...mockDocs['houses/h1'], rentFrequency: 'weekly', weeklyRent: 150 };
    mockDocs['rentHouseStates/h1'] = {
      startDate: '2026-11-02',
      startedAtMs: Date.parse('2026-11-02T15:00:00.000Z'),
    };
    guest('gA', { moveInDate: '2026-10-01' });
    mockDocs['rentAccounts/gA'] = {
      guestId: 'gA',
      houseId: 'h1',
      houseJoinedAtMs: LONG_AGO,
      joinedOn: '2026-10-01',
      reactivatedOn: null,
      anchoredTo: '2026-11-02',
      chargeFrom: '2026-11-09',
      chargedThrough: '2026-11-22',
      chargedHouseId: 'h1',
    };
    const [row] = (await call('manager', { houseId: 'h1', frequency: 'weekly', price: 175 }))
      .residents;
    expect(row).toMatchObject({ firstDay: '2026-11-23', amountCents: 17500, nowCents: 0 });
  });
});
