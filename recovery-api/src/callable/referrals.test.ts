import { handleCreateReferral, handleGetReferral } from './referrals';

const ctx = {
  appId: 'homegroups' as const,
  uid: 'uid123',
  email: 'user@test.com',
};

const makeDb = (docData?: Record<string, unknown>) => {
  const docMock = {
    exists: docData !== undefined,
    id: 'ref123',
    data: () => docData,
  };
  return {
    collection: jest.fn().mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: 'ref123' }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: docData ? [{ id: 'ref123', data: () => docData }] : [],
      }),
      doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(docMock) }),
    }),
  } as any;
};

describe('handleCreateReferral', () => {
  it('creates referral and returns id + pending status', async () => {
    const db = makeDb();
    const result = await handleCreateReferral(
      {
        toApp: 'phoenix-cleanhouse',
        clientName: 'Jane Doe',
        clientEmail: 'jane@test.com',
      },
      ctx,
      db,
    );
    expect(result).toEqual({ id: 'ref123', status: 'pending' });
    expect(db.collection).toHaveBeenCalledWith('referrals');
  });

  it('rejects an unknown toApp with invalid-argument (registry gate, not Zod enum)', async () => {
    const db = makeDb();
    await expect(
      handleCreateReferral(
        { toApp: 'unknown', clientName: 'Jane', clientEmail: 'jane@test.com' },
        ctx,
        db,
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('writes fromApp and referredByApp from context.appId', async () => {
    const db = makeDb();
    await handleCreateReferral(
      { toApp: 'sober-living', clientName: 'Bob', clientEmail: 'bob@test.com' },
      ctx,
      db,
    );
    const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
    expect(addCall.fromApp).toBe('homegroups');
    expect(addCall.referredByApp).toBe('homegroups');
  });

  it('stamps createdAt from the server clock, not the caller', async () => {
    const db = makeDb();
    await handleCreateReferral(
      { toApp: 'sober-living', clientName: 'Bob', clientEmail: 'bob@test.com' },
      ctx,
      db,
    );
    const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
    // The repo rule is FieldValue.serverTimestamp() for audit fields. A `new
    // Date()` here would be the calling service's clock, which this API does not
    // control, so it could be skewed, backdated or future-dated. Asserting "not a
    // Date" pins the rule without depending on the sentinel's internals.
    expect(addCall.createdAt).toBeDefined();
    expect(addCall.createdAt).not.toBeInstanceOf(Date);
  });

  it('stores the canonical toApp for a display-name wire value', async () => {
    const db = makeDb();
    await handleCreateReferral(
      { toApp: 'Regroup', clientName: 'Jane', clientEmail: 'jane@test.com' },
      ctx,
      db,
    );
    const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
    expect(addCall.toApp).toBe('phoenix-cleanhouse');
  });

  it('stores the canonical toApp for a legacy alias wire value', async () => {
    const db = makeDb();
    await handleCreateReferral(
      { toApp: 'sober-living', clientName: 'Jane', clientEmail: 'jane@test.com' },
      ctx,
      db,
    );
    const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
    expect(addCall.toApp).toBe('phoenix-cleanhouse');
  });
});

describe('handleGetReferral', () => {
  it('throws not-found when document does not exist', async () => {
    const db = makeDb(); // docData undefined → exists: false
    await expect(handleGetReferral({ id: 'nonexistent' }, ctx, db)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('throws permission-denied when referredBy does not match', async () => {
    const db = makeDb({
      referredBy: 'other-uid',
      referredByApp: 'homegroups',
      toApp: 'sober-living',
      clientName: 'Jane',
      clientEmail: 'jane@test.com',
      status: 'pending',
      fromApp: 'homegroups',
    });
    await expect(handleGetReferral({ id: 'ref123' }, ctx, db)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
