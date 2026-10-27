/**
 * Drift guard for the invited self-create rule (firebase/firestore.rules,
 * isInvitedSelfCreate). The rule allows a resident's own guest doc to carry
 * only the fields SignUpForm writes, at the values it writes. If the Guest
 * entity gains a field or changes a default, this fails before the rule
 * would start refusing real signups.
 *
 * Runs the app's real builder (buildSelfCreateGuest, which SignUpForm calls)
 * and checks it against the rule's hasOnly list and the shared fixture
 * (firebase/fixtures/selfCreatePayload), which the rules suite also uses.
 * Undefined fields are dropped as Firestore does with ignoreUndefinedProperties.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSelfCreateGuest } from '../selfCreateGuest';
import {
  SELF_CREATE_FIXED_VALUES,
  selfCreatePayload,
} from '../../../../firebase/fixtures/selfCreatePayload';

const rules = fs.readFileSync(
  path.resolve(__dirname, '../../../../firebase/firestore.rules'),
  'utf8',
);

function allowedKeys(): string[] {
  const fn = rules.slice(rules.indexOf('function isInvitedSelfCreate'));
  const list = /hasOnly\(\[([\s\S]*?)\]\)/.exec(fn);
  if (!list) throw new Error('hasOnly list not found in isInvitedSelfCreate');
  return list[1]
    .split(',')
    .map((k) => k.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

const user = {
  uid: 'invitee',
  houseId: 'houseA',
  firstName: 'New',
  lastName: 'Resident',
  email: 'new@example.com',
  phoneNumber: '555-0100',
};

function signupPayload(type: 'guest' | 'senior-peer', initialPhase?: string) {
  const guest = buildSelfCreateGuest(user as any, { type, initialPhase });
  return JSON.parse(JSON.stringify(guest)) as Record<string, unknown>;
}

describe('SignUpForm self-create payload vs the rules', () => {
  it('every field SignUpForm writes is allowed by the self-create rule', () => {
    const allowed = allowedKeys();
    const extra = Object.keys(signupPayload('guest')).filter((k) => !allowed.includes(k));
    expect(extra).toEqual([]);
  });

  it('writes exactly the fields of the shared fixture the rules suite accepts', () => {
    expect(Object.keys(signupPayload('guest')).sort()).toEqual(
      Object.keys(selfCreatePayload('invitee', 'houseA')).sort(),
    );
  });

  it('writes the values the rule requires (shared fixture)', () => {
    expect(signupPayload('guest')).toMatchObject({
      ...SELF_CREATE_FIXED_VALUES,
      isAdmin: false,
      phase: '',
    });
  });

  it('names the invitee as creator, as the rule requires when sent', () => {
    expect(signupPayload('guest')).toMatchObject({ createdBy: 'invitee', updatedBy: 'invitee' });
  });

  it('sets isAdmin only for a senior-peer invitation, and carries its initialPhase', () => {
    expect(signupPayload('senior-peer', 'phase-2')).toMatchObject({
      isAdmin: true,
      phase: 'phase-2',
    });
  });

  it('never sends money, Stripe or membership fields', () => {
    const payload = signupPayload('guest');
    for (const k of [
      'autoPayEnabled',
      'stripeCustomerId',
      'defaultPaymentMethodId',
      'membership',
      'pendingInvitation',
      'moveOutDate',
    ]) {
      expect(payload).not.toHaveProperty(k);
    }
  });
});
