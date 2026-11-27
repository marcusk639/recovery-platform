const d = require('../docs');

describe('seeded documents (guest-my-documents.yaml)', () => {
  const docs = d.documents(Date.parse('2026-11-26T12:00:00Z'));
  const byId = Object.fromEntries(docs.map((doc) => [doc.id, doc]));

  it("files one under guest-a's record and one under guest-b's, in the seeded house", () => {
    expect(byId['e2e-doc-a']).toMatchObject({ houseId: d.HOUSE, guestId: 'guest-a' });
    expect(byId['e2e-doc-b']).toMatchObject({ houseId: d.HOUSE, guestId: 'guest-b' });
  });

  it("keeps each file in its resident's folder, as getDocumentLink requires", () => {
    for (const doc of docs) {
      expect(doc.storagePath).toBe(`houses/${d.HOUSE}/guests/${doc.guestId}/documents/${doc.id}`);
      expect(doc).not.toHaveProperty('storageUrl'); // the rules refuse permanent links
    }
  });
});
