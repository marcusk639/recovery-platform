import {
  buildOperatorUserDoc,
  canCreateHouses,
  newOperatorCredentials,
  readStagingConfig,
  STAGING_PROJECT_ID,
} from '../stagingOperator/staging';

const configFile = '/home/me/.config/regroup-e2e/firebase-web-config.json';
const reader = (content: string) => () => content;

describe('readStagingConfig', () => {
  it('returns the API key and project for the staging project', () => {
    const json = JSON.stringify({ apiKey: 'AIza-test', projectId: 'regroup-e2e', appId: 'x' });
    expect(readStagingConfig(configFile, reader(json))).toEqual({
      apiKey: 'AIza-test',
      projectId: STAGING_PROJECT_ID,
    });
  });

  it.each([
    [
      'a missing file',
      () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    ],
    ['invalid JSON', reader('{not json')],
    ['an empty apiKey', reader(JSON.stringify({ apiKey: '', projectId: 'regroup-e2e' }))],
    [
      'another project',
      reader(JSON.stringify({ apiKey: 'AIza-test', projectId: 'phoenix-cleanhouse' })),
    ],
  ])('refuses %s, pointing at ~/.config/regroup-e2e', (_case, read) => {
    expect(() => readStagingConfig(configFile, read)).toThrow('~/.config/regroup-e2e');
  });

  it('names the wrong project it was given', () => {
    const json = JSON.stringify({ apiKey: 'AIza-test', projectId: 'phoenix-cleanhouse' });
    expect(() => readStagingConfig(configFile, reader(json))).toThrow('phoenix-cleanhouse');
  });
});

describe('buildOperatorUserDoc', () => {
  it("matches the web signup's operator user", () => {
    const doc = buildOperatorUserDoc('u1', 'a@rats-e2e.com');
    expect(doc).toMatchObject({
      id: 'u1',
      uid: 'u1',
      email: 'a@rats-e2e.com',
      billingEmail: 'a@rats-e2e.com',
      isSuperAdmin: true,
      potentialSuperAdmin: true,
      termsOfService: true,
      emailVerified: true,
      isAdmin: false,
      houseAccountVerified: false,
      isAnonymous: false,
      houseCode: null,
    });
    expect(doc.subscriptionMetadata).toEqual({
      subscriptionId: '',
      currentPeriodEnd: 0,
      status: '',
      customerId: '',
      items: { guestItemId: '', houseItemId: '' },
      houses: {},
    });
    expect(doc).not.toHaveProperty('password');
  });
});

describe('canCreateHouses', () => {
  it.each(['active', 'trialing', 'cancelling'])('allows a tier with status %s', (status) => {
    expect(canCreateHouses({ tier: 'starter', status })).toBe(true);
  });

  it.each([
    ['status incomplete', { tier: 'starter', status: 'incomplete' }],
    ['an empty status', { tier: 'starter', status: '' }],
    ['no tier', { status: 'trialing' }],
    ['an empty tier', { tier: '', status: 'trialing' }],
    ['null', null],
    ['a non-object', 'trialing'],
  ])('refuses %s', (_case, meta) => {
    expect(canCreateHouses(meta)).toBe(false);
  });
});

describe('newOperatorCredentials', () => {
  it('makes a timestamped email and a random password', () => {
    const creds = newOperatorCredentials(new Date('2026-11-09T22:05:07Z'), (n) =>
      Buffer.alloc(n, 0xab),
    );
    expect(creds.email).toBe('operator-20261109-220507-abab@rats-e2e.com');
    expect(creds.password.length).toBeGreaterThanOrEqual(20);
    expect(creds.password).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
