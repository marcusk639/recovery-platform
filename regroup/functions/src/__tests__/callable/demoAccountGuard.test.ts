// The shared demo login (S5 / REV-A8): every callable is classified, and each
// one that changes state or costs money refuses the demo account before any
// Admin SDK call.
import * as fs from 'fs';
import * as path from 'path';

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (opts: unknown, handler?: unknown) => (typeof opts === 'function' ? opts : handler),
  };
});
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Any Admin SDK call made while armed is a side effect the guard should have prevented.
const mockState = { armed: false, calls: [] as string[] };
function mockDeep(name: string): unknown {
  const target = function () {};
  return new Proxy(target, {
    get(_t, key) {
      if (key === 'then') return undefined;
      if (key === Symbol.toPrimitive) return () => name;
      return mockDeep(`${name}.${String(key)}`);
    },
    apply() {
      if (mockState.armed) mockState.calls.push(name);
      return mockDeep(`${name}()`);
    },
  });
}
jest.mock('firebase-admin', () => mockDeep('admin'));
jest.mock('firebase-admin/firestore', () => mockDeep('firestore'));
jest.mock('firebase-admin/auth', () => mockDeep('auth'));

import { DEMO_REFUSED_MESSAGE, isDemoAccount } from '../../util/demoAccount';

/** Change state or cost money (Stripe, email, invitations, claims, deletes). */
const REFUSED = [
  'addAdminAuthorization',
  'addGuestAuthorization',
  'deleteAdminAuthorization',
  'givePotentialSuperAdminPrivilege',
  'promoteGuestsToAdmin',
  'removePrivilegesForGuests',
  'verifyUserEmail',
  'finishOperatorSetup',
  'createHouses',
  'createInvitation',
  'redeemInvitation',
  'castOxfordVote',
  'setOxfordEnabled',
  'connectStripeAccount',
  'createPaymentIntent',
  'disconnectStripeAccount',
  'updatePaymentInfo',
  'resolveFailedPaymentOffline',
  'applyBundleDiscount',
  'cancelUserSubscription',
  'createBillingPortalSession',
  'createOperatorSubscription',
  'reactivateOperatorSubscription',
  'sendConfirmationEmail',
  'updateSubscriptionGuests',
  'updateSubscriptionHouses',
];
/** deleteAccount refuses the demo account with its own message (callable/account.ts). */
const REFUSED_ELSEWHERE = ['deleteAccount'];
/**
 * Reads the demo needs; the rules and claims scope them as for any account.
 * findMeetings and userIsAtMeeting reach paid APIs (recovery-api, Google
 * geocoding), but any free signup can call them too, so refusing the demo
 * account would not lower that exposure; each account's calls are limited
 * instead (util/rateLimit.ts, #316). previewRentCharges (#307) only reads.
 */
const ALLOWED = [
  'complianceExport',
  'findMeetings',
  'getAppConfig',
  'getDocumentLink',
  'getPaymentMethod',
  'getStripeAccountStatus',
  'getTierCatalog',
  'listHousePayments',
  'listPayments',
  'myHouseTiers',
  'peekInvitation',
  'previewRentCharges',
  'rentRoiMetrics',
  'userIsAtMeeting',
];

const callableDir = path.join(__dirname, '../../callable');
const modules = fs.readdirSync(callableDir).filter((f) => f.endsWith('.ts'));
const exportsByModule = modules.map((file) => ({
  file,
  names: [
    ...fs
      .readFileSync(path.join(callableDir, file), 'utf8')
      .matchAll(/^export const (\w+) = onCall\s*(?:<[^>]*>)?\(/gm),
  ].map((m) => m[1]),
}));

// The demo account carries the server-set claim (S5); its email alone is nothing.
const demoAuth = (email = 'demo_user@appdemo.net', extra: object = { demo: true }) => ({
  uid: 'demo-uid',
  token: { email, auth_time: Math.floor(Date.now() / 1000), ...extra },
});

type Handler = (request: unknown) => Promise<unknown>;
function handlerFor(name: string): Handler {
  const owner = exportsByModule.find((m) => m.names.includes(name))!;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(callableDir, owner.file))[name] as Handler;
}

afterEach(() => {
  mockState.armed = false;
  mockState.calls = [];
});

// Every onCall( in src/ (comments aside) must be one of the exports read above,
// so a callable defined another way or elsewhere cannot skip classification.
it('finds every onCall in src/', () => {
  const srcRoot = path.join(__dirname, '../..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
      return e.name.endsWith('.ts') ? [full] : [];
    });
  const calls = walk(srcRoot).reduce((n, file) => {
    const code = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    return n + (code.match(/\bonCall\s*(?:<[^>]*>)?\(/g) ?? []).length;
  }, 0);
  expect(calls).toBe(exportsByModule.flatMap((m) => m.names).length);
});

it('classifies every callable exactly once', () => {
  const all = exportsByModule.flatMap((m) => m.names).sort();
  const classified = [...REFUSED, ...REFUSED_ELSEWHERE, ...ALLOWED].sort();
  expect(all.length).toBeGreaterThan(30);
  expect(classified).toEqual(all);
});

describe.each(REFUSED)('%s', (name) => {
  it('refuses the demo account before any Admin SDK call', async () => {
    const handler = handlerFor(name);
    mockState.armed = true;
    await expect(
      handler({ auth: demoAuth('Demo_User@AppDemo.net'), data: {} }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: DEMO_REFUSED_MESSAGE,
    });
    expect(mockState.calls).toEqual([]);
  });

  it('still refuses the demo account after its email was changed (the demo claim)', async () => {
    const handler = handlerFor(name);
    mockState.armed = true;
    await expect(
      handler({ auth: demoAuth('attacker@example.com', { demo: true }), data: {} }),
    ).rejects.toMatchObject({ code: 'permission-denied', message: DEMO_REFUSED_MESSAGE });
    expect(mockState.calls).toEqual([]);
  });

  it('does not refuse an account without the claim, even one with the demo email', async () => {
    const handler = handlerFor(name);
    const outcome = await Promise.race([
      handler({ auth: demoAuth('demo_user@appdemo.net', {}), data: {} }).then(
        () => undefined,
        (error: { message?: string }) => error?.message,
      ),
      new Promise((resolve) => setTimeout(() => resolve('timed out'), 2000)),
    ]);
    expect(outcome).not.toBe(DEMO_REFUSED_MESSAGE);
  });
});

it('deleteAccount refuses the demo account by its claim, whatever its email', async () => {
  await expect(handlerFor('deleteAccount')({ auth: demoAuth(), data: {} })).rejects.toMatchObject({
    code: 'permission-denied',
  });
  await expect(
    handlerFor('deleteAccount')({ auth: demoAuth('attacker@example.com', { demo: true }), data: {} }),
  ).rejects.toMatchObject({ code: 'permission-denied' });
});

describe('isDemoAccount', () => {
  it('is not matched by the demo email alone (owner decision 2026-11-27)', () => {
    expect(isDemoAccount({ token: { email: 'demo_user@appdemo.net' } })).toBe(false);
  });

  it('matches the server-set demo claim whatever the email', () => {
    expect(isDemoAccount({ token: { demo: true, email: 'attacker@example.com' } })).toBe(true);
    expect(isDemoAccount({ token: { demo: true } })).toBe(true);
    expect(isDemoAccount({ token: { demo: 'true', email: 'a@example.com' } })).toBe(false);
  });

  it('is false with no auth, no email or a non-string email', () => {
    expect(isDemoAccount(undefined)).toBe(false);
    expect(isDemoAccount({ token: {} })).toBe(false);
    expect(isDemoAccount({ token: { email: { value: 'demo_user@appdemo.net' } } })).toBe(false);
    expect(isDemoAccount({ token: { email: 'demo_user@appdemo.net.evil.com' } })).toBe(false);
  });
});
