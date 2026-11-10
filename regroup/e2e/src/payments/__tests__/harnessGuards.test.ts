import {
  assertLocalSandbox,
  E2E_LOCAL_SANDBOX_ACCOUNT_ID,
  E2E_SANDBOX_ACCOUNT_ID,
  LIVE_PRODUCTION_ACCOUNT_ID,
} from '../../stripeSandbox';
import { makeStripe } from '../../__tests__/helpers/mockStripe';
import { assertEmulatorEnv, functionsBase } from '../harness/guards';
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
    GCLOUD_PROJECT: 'demo-regroup-e2e',
  };

  it('accepts the demo project on emulators', () => {
    expect(() => assertEmulatorEnv(ok)).not.toThrow();
  });
  it.each([
    [{ ...ok, GCLOUD_PROJECT: 'phoenix-cleanhouse' }, /demo-regroup-e2e/],
    [{ ...ok, GCLOUD_PROJECT: 'regroup-e2e' }, /demo-regroup-e2e/],
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
    expect(functionsBase({})).toBe('http://127.0.0.1:5101/demo-regroup-e2e/us-central1');
  });

  it('can point at another local emulator', () => {
    const base = 'http://127.0.0.1:5001/demo-regroup-e2e/us-central1';
    expect(functionsBase({ E2E_FUNCTIONS_BASE: base })).toBe(base);
  });

  it.each([
    'https://us-central1-phoenix-cleanhouse.cloudfunctions.net',
    'http://127.0.0.1.example.com:5001/demo-regroup-e2e/us-central1',
    'http://127.0.0.1:5001/phoenix-cleanhouse/us-central1',
  ])('refuses %s', (base) => {
    expect(() => functionsBase({ E2E_FUNCTIONS_BASE: base })).toThrow(/Refusing/);
  });
});
