import {
  formatRunResult,
  RunDeps,
  RunResult,
  runStagingOperator,
  TEST_PAYMENT_METHOD,
} from '../stagingOperator/run';
import { StagingClient } from '../stagingOperator/stagingClient';

const STAGING_JSON = JSON.stringify({ apiKey: 'AIza-test', projectId: 'regroup-e2e' });
const EMAIL = 'operator-20261109-220507-abab@rats-e2e.com';

const jwt = (aud: string) =>
  ['{"alg":"RS256"}', JSON.stringify({ aud, sub: 'u1' }), 'sig']
    .map((part) => Buffer.from(part).toString('base64url'))
    .join('.');
const TOKEN = jwt('regroup-e2e');

const SUBSCRIBED = {
  tier: 'starter',
  status: 'trialing',
  customerId: 'cus_123',
  subscriptionId: 'sub_456',
};

function fakeClient(
  overrides: Partial<StagingClient> = {},
  readback: Record<string, unknown> = SUBSCRIBED,
) {
  const calls: Array<[string, unknown[]]> = [];
  const record =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push([name, args]);
      return value;
    };
  const client: StagingClient = {
    keyProject: record('keyProject', '706803426891'),
    signUp: record('signUp', { uid: 'u1', idToken: TOKEN }),
    createUserDoc: record('createUserDoc', undefined),
    callFunction: record('callFunction', { ok: true }) as StagingClient['callFunction'],
    readUserDoc: record('readUserDoc', { email: EMAIL, subscriptionMetadata: readback }),
    ...overrides,
  };
  return { calls, client };
}

function deps(
  client: StagingClient,
  argv = ['--house-type', 'traditional', '--tier', 'starter'],
  json = STAGING_JSON,
): RunDeps {
  return {
    argv,
    configFile: '/home/me/.config/regroup-e2e/firebase-web-config.json',
    readFile: () => json,
    makeClient: () => client,
    now: () => new Date('2026-11-09T22:05:07Z'),
    random: (n) => Buffer.alloc(n, 0xab),
  };
}

describe('runStagingOperator', () => {
  it('subscribes a new operator and returns their sign-in details', async () => {
    const { calls, client } = fakeClient();
    const result = await runStagingOperator(deps(client));

    expect(calls.map(([name]) => name)).toEqual([
      'keyProject',
      'signUp',
      'createUserDoc',
      'callFunction',
      'readUserDoc',
    ]);
    const [, [email]] = calls[1];
    expect(email).toBe(EMAIL);
    const [, [token, uid, doc]] = calls[2] as [string, [string, string, Record<string, unknown>]];
    expect([token, uid]).toEqual([TOKEN, 'u1']);
    expect(doc).toMatchObject({ id: 'u1', email: EMAIL, isSuperAdmin: true });
    expect(calls[3][1]).toEqual([
      TOKEN,
      'createOperatorSubscription',
      {
        user: { id: 'u1', email: EMAIL, subscriptionMetadata: doc.subscriptionMetadata },
        paymentMethod: TEST_PAYMENT_METHOD,
        houseType: 'traditional',
        tier: 'starter',
        billingInterval: 'month',
      },
    ]);
    expect(calls[4][1]).toEqual([TOKEN, 'u1']);
    expect(result).toEqual({
      email: EMAIL,
      password: expect.any(String),
      uid: 'u1',
      plan: { houseType: 'traditional', tier: 'starter', interval: 'month' },
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      status: 'trialing',
    });
  });

  it('refuses before signing up when the plan is invalid', async () => {
    const { calls, client } = fakeClient();
    await expect(
      runStagingOperator(deps(client, ['--tier', 'network', '--house-type', 'oxford'])),
    ).rejects.toThrow('standard, plus');
    expect(calls).toEqual([]);
  });

  it('refuses before signing up when the config is not staging', async () => {
    const { calls, client } = fakeClient();
    const production = JSON.stringify({ apiKey: 'AIza-test', projectId: 'phoenix-cleanhouse' });
    await expect(runStagingOperator(deps(client, undefined, production))).rejects.toThrow(
      'phoenix-cleanhouse',
    );
    expect(calls).toEqual([]);
  });

  it('refuses before signing up when the API key belongs to another project', async () => {
    const { calls, client } = fakeClient({
      keyProject: async () => {
        calls.push(['keyProject', []]);
        return '155667333239';
      },
    });
    await expect(runStagingOperator(deps(client))).rejects.toThrow('155667333239');
    expect(calls.map(([name]) => name)).toEqual(['keyProject']);
  });

  it('stops when the new account is not on staging, and says where it is', async () => {
    const { calls, client } = fakeClient({
      signUp: async () => {
        calls.push(['signUp', []]);
        return { uid: 'u1', idToken: jwt('phoenix-cleanhouse') };
      },
    });
    const err: Error = await runStagingOperator(deps(client)).catch((e) => e);
    expect(err.message).toContain('phoenix-cleanhouse');
    expect(err.message).not.toContain('left on staging');
    expect(calls.map(([name]) => name)).toEqual(['keyProject', 'signUp']);
  });

  it('reports a failed subscription with the account it left behind', async () => {
    const { client } = fakeClient({
      callFunction: async () => {
        throw new Error('createOperatorSubscription failed (HTTP 400): Card declined');
      },
    });
    const err: Error = await runStagingOperator(deps(client)).catch((e) => e);
    expect(err.message).toContain('createOperatorSubscription');
    expect(err.message).toContain('Card declined');
    expect(err.message).toContain(EMAIL);
    expect(err.message).toContain('u1');
  });

  it('fails when the subscribed user cannot create houses', async () => {
    const { client } = fakeClient({}, { ...SUBSCRIBED, status: 'incomplete' });
    await expect(runStagingOperator(deps(client))).rejects.toThrow('cannot create houses');
  });
});

describe('formatRunResult', () => {
  it('prints what the owner needs to sign in, and the admin email note', () => {
    const result: RunResult = {
      email: EMAIL,
      password: 'pw-123',
      uid: 'u1',
      plan: { houseType: 'oxford', tier: 'plus', interval: 'year' },
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      status: 'trialing',
    };
    const text = formatRunResult(result);
    for (const part of [
      EMAIL,
      'pw-123',
      'u1',
      'oxford',
      'plus',
      'year',
      'cus_123',
      'sub_456',
      'trialing',
    ]) {
      expect(text).toContain(part);
    }
    expect(text).toContain('E2EStaging');
    expect(text).toContain('com.rats.dev.e2e.stg');
    expect(text).toContain('OrgSetup');
    expect(text).toContain('admin@regroup-app.com');
  });
});
