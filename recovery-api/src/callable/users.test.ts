import { handleGetUserProfile, handleUpdateUserProfile } from './users';

const ctx = {
  appId: 'homegroups' as const,
  uid: 'uid123',
  email: 'user@test.com',
};

const makeDb = (docData?: Record<string, unknown>) =>
  ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: docData !== undefined,
          data: () => docData,
        }),
        set: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  }) as any;

describe('handleGetUserProfile', () => {
  it('returns null profile when document does not exist', async () => {
    const result = await handleGetUserProfile(ctx, makeDb());
    expect(result).toEqual({ profile: null });
  });

  it('returns profile data when document exists', async () => {
    const profile = {
      uid: 'uid123',
      appId: 'homegroups',
      email: 'user@test.com',
    };
    const result = await handleGetUserProfile(ctx, makeDb(profile));
    expect(result).toEqual({ profile });
  });

  it('uses composite doc ID appId:uid', async () => {
    const db = makeDb();
    await handleGetUserProfile(ctx, db);
    expect(db.collection).toHaveBeenCalledWith('users');
    const collectionMock = db.collection.mock.results[0].value;
    expect(collectionMock.doc).toHaveBeenCalledWith('homegroups:uid123');
  });
});

describe('handleUpdateUserProfile', () => {
  it('merges updates and returns updated: true', async () => {
    const db = makeDb();
    const result = await handleUpdateUserProfile({ displayName: 'Jane' }, ctx, db);
    expect(result).toEqual({ updated: true });
    const docMock = db.collection.mock.results[0].value.doc.mock.results[0].value;
    expect(docMock.set).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Jane' }), {
      merge: true,
    });
  });

  it('throws ZodError on invalid sobrietyDate format', async () => {
    const db = makeDb();
    await expect(
      handleUpdateUserProfile({ sobrietyDate: 'not-a-date' }, ctx, db),
    ).rejects.toThrow();
  });
});
