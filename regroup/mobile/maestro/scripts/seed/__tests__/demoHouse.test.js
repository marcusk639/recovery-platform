const { DEMO_HOUSE, DEMO_EMAIL, demoHouse } = require('../demoHouse');

const NOW = Date.parse('2026-11-27T12:00:00Z');

describe('demoHouse fixtures (demo-account-refused.yaml)', () => {
  const f = demoHouse(NOW);

  it("is the account the landing screen's Demo link signs in to", () => {
    expect(f.account.email).toBe(DEMO_EMAIL);
    expect(f.account.password).toBe('DemoUser1');
  });

  it('carries the server-set demo claim and staff claims on a demo house only', () => {
    expect(f.account.claims).toMatchObject({
      demo: true,
      admin: { [DEMO_HOUSE]: true },
      superAdmin: { [DEMO_HOUSE]: true },
    });
    expect(f.house).toMatchObject({ id: DEMO_HOUSE, isDemoHouse: true, ownerId: f.account.uid });
  });

  it('is watched by the scheduled restore (config/demoAccount)', () => {
    expect(f.config).toEqual({ uid: f.account.uid, tokensValidAfter: null });
  });
});
