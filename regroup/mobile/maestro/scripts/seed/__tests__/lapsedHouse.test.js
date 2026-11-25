const { LAPSED_HOUSE, lapsedHouse } = require('../lapsedHouse');

// A stand-in for firebase-admin's Timestamp: the builders only call fromMillis.
const Timestamp = { fromMillis: (ms) => ({ ms }) };
const NOW = Date.parse('2026-11-25T12:00:00Z');

describe('lapsedHouse fixtures (resident-limited-view.yaml)', () => {
  const f = lapsedHouse(NOW, Timestamp);

  it('is a canceled house with no grace period, so its resident is past grace', () => {
    expect(f.house.id).toBe(LAPSED_HOUSE);
    expect(f.house.subscriptionStatus).toBe('canceled');
    expect(f.house).not.toHaveProperty('guestGraceEndsAt');
  });

  it("is owned by an operator whose subscription is canceled (the create trigger derives the house's status from it)", () => {
    expect(f.house.ownerId).toBe(f.operator.uid);
    expect(f.house.superAdminId).toBe(f.operator.uid);
    expect(f.operator.user.subscriptionMetadata.status).toBe('canceled');
    expect(f.operator.claims.superAdmin).toEqual({ [LAPSED_HOUSE]: true });
  });

  it('has one resident of that house only', () => {
    expect(f.resident.email).toBe('test-guest-lapsed@rats-e2e.com');
    expect(f.resident.claims).toEqual({ guest: { [LAPSED_HOUSE]: true } });
    expect(f.resident.guest).toMatchObject({
      id: 'guest-lapsed',
      houseId: LAPSED_HOUSE,
      userId: f.resident.uid,
      status: 'active',
    });
    expect(f.resident.user).toMatchObject({ isGuest: true, houseId: LAPSED_HOUSE });
  });

  it('gives the resident one payment of their own', () => {
    expect(f.payments).toHaveLength(1);
    expect(f.payments[0]).toMatchObject({
      id: 'e2e-pay-lapsed',
      houseId: LAPSED_HOUSE,
      guestId: 'guest-lapsed',
      guestUserId: f.resident.uid,
      amount: 3333,
    });
  });

  it('gives the resident one document of their own, in their folder, and a house document they must not see', () => {
    const own = f.documents.find((doc) => doc.guestId === 'guest-lapsed');
    const houseDoc = f.documents.find((doc) => !doc.guestId);
    expect(own).toMatchObject({
      id: 'e2e-doc-lapsed',
      houseId: LAPSED_HOUSE,
      storagePath: `houses/${LAPSED_HOUSE}/guests/guest-lapsed/documents/e2e-doc-lapsed`,
    });
    expect(houseDoc).toMatchObject({
      id: 'e2e-doc-lapsed-house',
      storagePath: `houses/${LAPSED_HOUSE}/documents/e2e-doc-lapsed-house`,
    });
    for (const doc of f.documents) {
      expect(doc).not.toHaveProperty('storageUrl'); // the rules refuse permanent links
    }
  });

  it('uses only @rats-e2e.com accounts', () => {
    for (const p of [f.operator, f.resident]) {
      expect(p.email).toMatch(/@rats-e2e\.com$/);
    }
  });
});
