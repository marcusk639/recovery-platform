// getDocumentLink: a short-lived link to a document, for the house's staff only
// (owner decision 2026-11-09: no permanent download links for documents).
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
  HttpsError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockDocs: Record<string, Record<string, unknown> | undefined> = {};
const mockGetSignedUrl = jest.fn((..._args: any[]) => Promise.resolve(['https://signed.example/doc']));
const mockFile = jest.fn((_path: string) => ({ getSignedUrl: mockGetSignedUrl }));
jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = mockDocs[`${name}/${id}`];
          return { exists: !!data, get: (field: string) => data?.[field] };
        },
      }),
    }),
  }),
  storage: () => ({ bucket: () => ({ file: (path: string) => mockFile(path) }) }),
}));

const mockClaims: Record<string, unknown> = {};
jest.mock('../../util/houseRoleStore', () => ({
  ...jest.requireActual('../../util/houseRoleStore'),
  liveClaims: async (uid: string) => mockClaims[uid] ?? {},
}));

import { getDocumentLink } from '../../callable/documentLinks';

const call = (uid: string | null, data: unknown) =>
  (getDocumentLink as any)({ auth: uid ? { uid } : undefined, data });

describe('getDocumentLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs['documents/doc1'] = {
      houseId: 'h1',
      storagePath: 'houses/h1/guests/g1/documents/doc1',
    };
    mockClaims.admin = { admin: { h1: true } };
    mockClaims.other = { admin: { h2: true } };
    mockClaims.resident = { guest: { h1: true } };
  });

  it('refuses a signed-out caller', async () => {
    await expect(call(null, { documentId: 'doc1' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it("gives the house's admin a read link that expires in 15 minutes", async () => {
    const before = Date.now();
    const result = await call('admin', { documentId: 'doc1' });

    expect(result.url).toBe('https://signed.example/doc');
    expect(mockFile).toHaveBeenCalledWith('houses/h1/guests/g1/documents/doc1');
    const [{ version, action, expires }] = mockGetSignedUrl.mock.calls[0] as any;
    expect({ version, action }).toEqual({ version: 'v4', action: 'read' });
    expect(expires - before).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(expires - before).toBeLessThan(15 * 60 * 1000 + 5000);
  });

  it('answers not-found to another house, a resident and an unknown id alike', async () => {
    for (const [uid, documentId] of [['other', 'doc1'], ['resident', 'doc1'], ['admin', 'nope']]) {
      await expect(call(uid, { documentId })).rejects.toMatchObject({ code: 'not-found' });
    }
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("won't sign a file outside the document's own house", async () => {
    mockDocs['documents/doc1'] = { houseId: 'h1', storagePath: 'houses/h2/documents/x' };
    await expect(call('admin', { documentId: 'doc1' })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});

describe("getDocumentLink: a resident's own documents", () => {
  const OWN = 'houses/h1/guests/g1/documents/doc2';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs['documents/doc2'] = { houseId: 'h1', guestId: 'g1', storagePath: OWN };
    mockDocs['guests/g1'] = { houseId: 'h1', userId: 'resident' };
    mockClaims.resident = { guest: { h1: true } };
    mockClaims.neighbour = { guest: { h1: true } };
    mockClaims.discharged = {};
  });

  it('gives the resident a read link to their own document', async () => {
    const result = await call('resident', { documentId: 'doc2' });
    expect(result.url).toBe('https://signed.example/doc');
    expect(mockFile).toHaveBeenCalledWith(OWN);
  });

  it("refuses another resident of the house", async () => {
    await expect(call('neighbour', { documentId: 'doc2' })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses the account once its guest claim is gone (moved out)', async () => {
    mockDocs['guests/g1'] = { houseId: 'h1', userId: 'discharged' };
    await expect(call('discharged', { documentId: 'doc2' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses when the guest record is in another house', async () => {
    mockDocs['guests/g1'] = { houseId: 'h2', userId: 'resident' };
    await expect(call('resident', { documentId: 'doc2' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses when the guest record is missing', async () => {
    delete mockDocs['guests/g1'];
    await expect(call('resident', { documentId: 'doc2' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it("won't sign a file outside the resident's own folder", async () => {
    mockDocs['documents/doc2'] = {
      houseId: 'h1',
      guestId: 'g1',
      storagePath: 'houses/h1/documents/house-lease',
    };
    await expect(call('resident', { documentId: 'doc2' })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("still gives the house's admin a link to it", async () => {
    await expect(call('admin', { documentId: 'doc2' })).resolves.toMatchObject({
      url: 'https://signed.example/doc',
    });
  });
});

