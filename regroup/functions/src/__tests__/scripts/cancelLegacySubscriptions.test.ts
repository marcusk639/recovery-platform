import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Stripe from 'stripe';
import {
  cancelListed,
  LEGACY_PRICE_IDS,
  listLegacySubscriptions,
  listUnmatched,
  main,
} from '../../scripts/cancelLegacySubscriptions';

const HOME = 'plan_HFkfwM5lQx6oud';
const RESIDENT = 'plan_HFkh7QvRnNjMy8';

const subscription = (id: string, status: string, prices: string[]) => ({
  id,
  customer: `cus_${id}`,
  status,
  metadata: {},
  items: { data: prices.map((p) => ({ price: { id: p }, quantity: 1 })) },
});

/** A hand-written Stripe: lists the given subscriptions, records writes in order. */
const fakeStripe = (subs: ReturnType<typeof subscription>[], onWrite?: (call: string) => void) => {
  const calls: string[] = [];
  const record = (call: string) => {
    onWrite?.(call);
    calls.push(call);
  };
  const stripe = {
    subscriptions: {
      list: jest.fn(() => ({
        async *[Symbol.asyncIterator]() {
          for (const s of subs) yield s;
        },
      })),
      update: jest.fn(async (id: string, params: unknown) => {
        record(`update:${id}:${JSON.stringify(params)}`);
        return { id };
      }),
      cancel: jest.fn(async (id: string) => {
        record(`cancel:${id}`);
        return { id, status: 'canceled' };
      }),
    },
  };
  return { stripe: stripe as unknown as Stripe, calls, fake: stripe };
};

const ACCOUNT = [
  subscription('sub_tier', 'trialing', ['price_tier_starter']),
  subscription('sub_legacy', 'active', [HOME, RESIDENT]),
  subscription('sub_legacy_gone', 'canceled', [HOME]),
  subscription('sub_other', 'active', ['price_something_else']),
];

const tmpRecord = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-cancel-')), 'record.json');

beforeEach(() => {
  process.env.STRIPE_PRICE_TRAD_STARTER = 'price_tier_starter';
});
afterEach(() => {
  delete process.env.STRIPE_PRICE_TRAD_STARTER;
});

describe('listing', () => {
  it('lists only live subscriptions on the legacy prices, and the rest as not touched', async () => {
    expect(LEGACY_PRICE_IDS).toEqual([HOME, RESIDENT]);
    const { stripe } = fakeStripe(ACCOUNT);

    const legacy = await listLegacySubscriptions(stripe);
    expect(legacy).toEqual([
      {
        id: 'sub_legacy',
        customer: 'cus_sub_legacy',
        status: 'active',
        items: [
          { price: HOME, quantity: 1 },
          { price: RESIDENT, quantity: 1 },
        ],
        metadata: {},
      },
    ]);
    await expect(listUnmatched(stripe)).resolves.toEqual(['sub_other']);
  });
});

describe('cancelListed', () => {
  it("refuses an id that isn't listed, writing and canceling nothing", async () => {
    const { stripe, calls } = fakeStripe(ACCOUNT);
    const records = await listLegacySubscriptions(stripe);
    const recordPath = tmpRecord();

    await expect(cancelListed(stripe, records, ['sub_other'], recordPath)).rejects.toThrow();

    expect(fs.existsSync(recordPath)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('refuses a record file inside the repository', async () => {
    const { stripe, calls } = fakeStripe(ACCOUNT);
    const records = await listLegacySubscriptions(stripe);
    const insideRepo = path.resolve(__dirname, 'legacy-cancel-record.json');

    await expect(cancelListed(stripe, records, ['sub_legacy'], insideRepo)).rejects.toThrow();

    expect(fs.existsSync(insideRepo)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('still finds the repository when git variables are inherited (as in a git hook)', async () => {
    const { stripe, calls } = fakeStripe(ACCOUNT);
    const records = await listLegacySubscriptions(stripe);
    const insideRepo = path.resolve(__dirname, 'legacy-cancel-record.json');
    const saved = process.env.GIT_DIR;
    // A git hook runs with GIT_DIR set to the repository's own git directory.
    process.env.GIT_DIR = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
    try {
      await expect(cancelListed(stripe, records, ['sub_legacy'], insideRepo)).rejects.toThrow(
        /outside the repository/,
      );
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
    expect(fs.existsSync(insideRepo)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('writes the record (mode 600) first, then marks and cancels each subscription', async () => {
    const recordPath = tmpRecord();
    const recordModeAtWrite: number[] = [];
    const { stripe, calls } = fakeStripe(ACCOUNT, () => {
      recordModeAtWrite.push(fs.statSync(recordPath).mode & 0o777);
    });
    const records = await listLegacySubscriptions(stripe);

    await expect(cancelListed(stripe, records, ['sub_legacy'], recordPath)).resolves.toEqual([
      'sub_legacy',
    ]);

    expect(recordModeAtWrite).toEqual([0o600, 0o600]);
    expect(JSON.parse(fs.readFileSync(recordPath, 'utf8'))).toEqual(records);
    expect(calls).toEqual([
      'update:sub_legacy:{"metadata":{"regroup_launch_cancel":"true"}}',
      'cancel:sub_legacy',
    ]);
  });
});

describe('main', () => {
  const run = (argv: string[], key?: string) => {
    const { stripe, calls, fake } = fakeStripe(ACCOUNT);
    const makeStripe = jest.fn(() => stripe);
    const log = jest.fn();
    const result = main(argv, { env: key ? { STRIPE_SECRET_KEY: key } : {}, makeStripe, log });
    return { result, calls, fake, makeStripe, log };
  };

  it('refuses a full live secret key before any Stripe call', async () => {
    const { result, makeStripe } = run([], 'sk_live_full');
    await expect(result).rejects.toThrow(/restricted/);
    expect(makeStripe).not.toHaveBeenCalled();
  });

  it('refuses to start without a key', async () => {
    const { result, makeStripe } = run([]);
    await expect(result).rejects.toThrow(/STRIPE_SECRET_KEY/);
    expect(makeStripe).not.toHaveBeenCalled();
  });

  it('accepts a restricted live key, and the dry run writes nothing', async () => {
    const { result, calls, fake, log } = run([], 'rk_live_restricted');
    await expect(result).resolves.toBeUndefined();
    expect(calls).toEqual([]);
    expect(fake.subscriptions.update).not.toHaveBeenCalled();
    expect(fake.subscriptions.cancel).not.toHaveBeenCalled();
    const printed = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('live');
    expect(printed).toContain('sub_legacy');
    expect(printed).toContain('sub_other');
  });
});
