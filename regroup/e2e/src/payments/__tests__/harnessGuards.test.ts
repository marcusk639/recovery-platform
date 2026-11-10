import {
  assertLocalSandbox,
  E2E_LOCAL_SANDBOX_ACCOUNT_ID,
  E2E_SANDBOX_ACCOUNT_ID,
  LIVE_PRODUCTION_ACCOUNT_ID,
} from '../../stripeSandbox';
import { makeStripe } from '../../__tests__/helpers/mockStripe';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertEmulatorEnv,
  assertEmulatorSecrets,
  assertSafeTarget,
  functionsBase,
  MANUAL_PROJECT,
  PAYMENTS_PROJECT,
} from '../harness/guards';
import { fetchEvents } from '../harness/eventPump';

const PINNED = '2026-01-28.clover';

describe('assertLocalSandbox', () => {
  it('accepts the local sandbox when it has no webhook endpoints', async () => {
    const { stripe } = makeStripe({ accountId: E2E_LOCAL_SANDBOX_ACCOUNT_ID });
    await expect(assertLocalSandbox(stripe, 'sk_test_abc')).resolves.toBe(
      E2E_LOCAL_SANDBOX_ACCOUNT_ID,
    );
  });

  it.each([E2E_SANDBOX_ACCOUNT_ID, LIVE_PRODUCTION_ACCOUNT_ID, 'acct_other'])(
    'refuses %s',
    async (accountId) => {
      const { stripe } = makeStripe({ accountId });
      await expect(assertLocalSandbox(stripe, 'sk_test_abc')).rejects.toThrow(
        /only the local sandbox/,
      );
    },
  );

  it('refuses a live key before calling Stripe', async () => {
    const { mock, stripe } = makeStripe({ accountId: E2E_LOCAL_SANDBOX_ACCOUNT_ID });
    await expect(assertLocalSandbox(stripe, 'sk_live_abc')).rejects.toThrow(/live/);
    expect(mock.accounts.retrieve).not.toHaveBeenCalled();
  });

  it('refuses a sandbox with a webhook endpoint, which would receive every test event', async () => {
    const { stripe } = makeStripe({
      accountId: E2E_LOCAL_SANDBOX_ACCOUNT_ID,
      endpoints: [{ id: 'we_1', url: 'https://x', status: 'enabled' }],
    });
    await expect(assertLocalSandbox(stripe, 'sk_test_abc')).rejects.toThrow(/webhook endpoint/);
  });
});

describe('assertEmulatorEnv', () => {
  const ok = {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9299',
    GCLOUD_PROJECT: 'demo-regroup-payments',
  };

  it("accepts the payment suite's own project on emulators", () => {
    expect(() => assertEmulatorEnv(ok)).not.toThrow();
  });
  it('refuses the manual-testing project unless the caller allows it', () => {
    const manual = { ...ok, GCLOUD_PROJECT: 'demo-regroup-e2e' };
    expect(() => assertEmulatorEnv(manual)).toThrow(/demo-regroup-payments/);
    expect(() => assertEmulatorEnv(manual, [PAYMENTS_PROJECT, MANUAL_PROJECT])).not.toThrow();
  });
  it('refuses a deployed project even when a caller lists it', () => {
    const prod = { ...ok, GCLOUD_PROJECT: 'phoenix-cleanhouse' };
    expect(() => assertEmulatorEnv(prod, [PAYMENTS_PROJECT, 'phoenix-cleanhouse'])).toThrow(/Refusing/);
  });
  it.each([
    [{ ...ok, GCLOUD_PROJECT: 'phoenix-cleanhouse' }, /demo-regroup-payments/],
    [{ ...ok, GCLOUD_PROJECT: 'regroup-e2e' }, /demo-regroup-payments/],
    [{ ...ok, FIRESTORE_EMULATOR_HOST: '' }, /FIRESTORE_EMULATOR_HOST/],
    [{ ...ok, FIREBASE_AUTH_EMULATOR_HOST: undefined }, /FIREBASE_AUTH_EMULATOR_HOST/],
  ])('refuses %j', (env, error) => {
    expect(() => assertEmulatorEnv(env as NodeJS.ProcessEnv)).toThrow(error);
  });
});

describe('fetchEvents', () => {
  const event = (id: string, created: number, object: object, api_version = PINNED) => ({
    id,
    created,
    api_version,
    type: 'x',
    data: { object },
  });
  const stripeWith = (data: object[]) =>
    ({ events: { list: jest.fn(async () => ({ data, has_more: false })) } }) as never;

  it('returns the object’s events oldest first, by id, customer or subscription', async () => {
    const stripe = stripeWith([
      event('e3', 3, { id: 'in_1', subscription: 'sub_1' }),
      event('e2', 2, { id: 'other', customer: 'cus_1' }),
      event('e1', 1, { id: 'sub_1' }),
    ]);
    const ids = (await fetchEvents(stripe, { since: 0, objectId: 'sub_1', settleMs: 0 })).map(
      (e) => e.id,
    );
    expect(ids).toEqual(['e1', 'e3']);
  });

  it('orders events created in the same second as Stripe does, not by id', async () => {
    // Stripe lists newest first; ids are random, so "evt_b" may be the older one.
    const stripe = stripeWith([
      event('evt_a', 5, { id: 'sub_1' }),
      event('evt_b', 5, { id: 'sub_1' }),
    ]);
    const ids = (await fetchEvents(stripe, { since: 0, objectId: 'sub_1', settleMs: 0 })).map(
      (e) => e.id,
    );
    expect(ids).toEqual(['evt_b', 'evt_a']);
  });

  it('throws at the deadline when no event has arrived, instead of returning none', async () => {
    const stripe = stripeWith([]);
    await expect(
      fetchEvents(stripe, { since: 0, objectId: 'sub_1', settleMs: 5, timeoutMs: 20 }),
    ).rejects.toThrow(/sub_1/);
  });

  it('throws at the deadline when the list never stops growing', async () => {
    let n = 0;
    const list = jest.fn(async () => ({
      data: Array.from({ length: ++n }, (_, i) => event(`e${i}`, i, { id: 'sub_1' })),
      has_more: false,
    }));
    const stripe = { events: { list } } as never;
    await expect(
      fetchEvents(stripe, { since: 0, objectId: 'sub_1', settleMs: 5, timeoutMs: 40 }),
    ).rejects.toThrow(/sub_1/);
  });

  it('refuses an event rendered in another API version, which production would not receive', async () => {
    const stripe = stripeWith([event('e1', 1, { id: 'sub_1' }, '2020-08-27')]);
    await expect(fetchEvents(stripe, { since: 0, objectId: 'sub_1', settleMs: 0 })).rejects.toThrow(
      /2020-08-27/,
    );
  });
});

describe('functionsBase', () => {
  it('defaults to the payment suite emulator', () => {
    expect(functionsBase({})).toBe('http://127.0.0.1:5101/demo-regroup-payments/us-central1');
  });

  it('can point at the manual-testing emulator for its own project', () => {
    const base = 'http://127.0.0.1:5001/demo-regroup-e2e/us-central1';
    expect(functionsBase({ E2E_FUNCTIONS_BASE: base, GCLOUD_PROJECT: 'demo-regroup-e2e' })).toBe(base);
  });

  it("refuses an emulator for a project other than the run's", () => {
    const base = 'http://127.0.0.1:5001/demo-regroup-e2e/us-central1';
    expect(() => functionsBase({ E2E_FUNCTIONS_BASE: base })).toThrow(/Refusing/);
  });

  it.each([
    'https://us-central1-phoenix-cleanhouse.cloudfunctions.net',
    'http://127.0.0.1.example.com:5001/demo-regroup-e2e/us-central1',
    'http://127.0.0.1:5001/phoenix-cleanhouse/us-central1',
  ])('refuses %s', (base) => {
    expect(() => functionsBase({ E2E_FUNCTIONS_BASE: base })).toThrow(/Refusing/);
  });
});

describe('assertEmulatorSecrets', () => {
  const KEY = 'sk_test_local_123';
  const WHSEC = 'whsec_local_456';
  let dir: string;
  let configDir: string;
  let secretFile: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-guard-'));
    configDir = path.join(dir, 'config');
    fs.mkdirSync(configDir);
    fs.writeFileSync(path.join(configDir, 'stripe-local-secret-key.txt'), `${KEY}\n`);
    fs.writeFileSync(path.join(configDir, 'stripe-local-webhook-secret.txt'), WHSEC);
    secretFile = path.join(dir, '.secret.local');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (lines: string[]) => fs.writeFileSync(secretFile, lines.join('\n'));
  const good = [`STRIPE_SECRET_KEY=${KEY}`, `STRIPE_TEST_WEBHOOK_SECRET="${WHSEC}"`, `STRIPE_CONNECT_TEST_WEBHOOK_SECRET=${WHSEC}`];

  it('accepts the regroup-local key and webhook secrets', () => {
    write(good);
    expect(() => assertEmulatorSecrets(secretFile, configDir)).not.toThrow();
  });

  it.each([
    ['another sandbox key', [`STRIPE_SECRET_KEY=sk_test_e2e_sandbox_999`, good[1], good[2]], /STRIPE_SECRET_KEY is not the regroup-local/],
    ['a missing webhook secret', [good[0], good[1]], /no STRIPE_CONNECT_TEST_WEBHOOK_SECRET/],
    ['an empty value', [good[0], 'STRIPE_TEST_WEBHOOK_SECRET=', good[2]], /no STRIPE_TEST_WEBHOOK_SECRET/],
    ['a key set twice, so the emulator may use the other one', [...good, 'STRIPE_SECRET_KEY=sk_test_e2e_sandbox_999'], /more than once/],
    ['a real SendGrid key', [...good, 'SENDGRID_API_KEY=SG.abc.def'], /SendGrid/],
  ])('refuses %s, without printing a value', (_case, lines, error) => {
    write(lines);
    let message = '';
    try {
      assertEmulatorSecrets(secretFile, configDir);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(error);
    for (const secret of [KEY, WHSEC, 'sk_test_e2e_sandbox_999', 'SG.abc.def']) expect(message).not.toContain(secret);
  });

  it('refuses a missing secret file', () => {
    expect(() => assertEmulatorSecrets(secretFile, configDir)).toThrow(/missing/);
  });
});

describe('assertSafeTarget', () => {
  it('refuses a functions emulator override before reading any secret', async () => {
    const env = {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9399',
      GCLOUD_PROJECT: 'demo-regroup-payments',
      E2E_FUNCTIONS_BASE: 'http://127.0.0.1:5001/demo-regroup-payments/us-central1',
    };
    await expect(assertSafeTarget(env)).rejects.toThrow(/only the payment suite emulator/);
  });
});
