/**
 * Drift guard for the invited self-create rule (firebase/firestore.rules,
 * isInvitedSelfCreate). The rule allows a resident's own guest doc to carry
 * only the fields SignUpForm writes, at the values it writes. If the Guest
 * entity gains a field or changes a default, this fails before the rule
 * would start refusing real signups.
 *
 * Builds the payload the way SignUpForm does: new Guest(), mapUserToGuest,
 * then isAdmin and phase from the invitation; undefined fields are dropped
 * as Firestore does with ignoreUndefinedProperties.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Guest } from '../../../entities/Guest';
import { mapUserToGuest } from '../../../util/guest';

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

function signupPayload(role: 'guest' | 'senior-peer', initialPhase: string) {
  const guest = mapUserToGuest(
    {
      uid: 'invitee',
      houseId: 'houseA',
      firstName: 'New',
      lastName: 'Resident',
      email: 'new@example.com',
      phoneNumber: undefined,
    } as any,
    new Guest(),
  );
  guest.isAdmin = role === 'senior-peer';
  guest.phase = initialPhase;
  return JSON.parse(JSON.stringify(guest)) as Record<string, unknown>;
}

describe('SignUpForm self-create payload vs the rules', () => {
  it('every field SignUpForm writes is allowed by the self-create rule', () => {
    const allowed = allowedKeys();
    const extra = Object.keys(signupPayload('guest', '')).filter((k) => !allowed.includes(k));
    expect(extra).toEqual([]);
  });

  it('writes the default values the rule requires', () => {
    expect(signupPayload('guest', '')).toMatchObject({
      status: 'active',
      rentOwed: 0,
      choreFees: 0,
      dailyHabit: 0,
      version: 0,
      step: 1,
      infoEntered: false,
      hasJob: false,
      supporters: [],
      jobs: [],
      isAdmin: false,
      phase: '',
    });
  });

  it('sets isAdmin only for a senior-peer invitation, and carries its initialPhase', () => {
    expect(signupPayload('senior-peer', 'phase-2')).toMatchObject({
      isAdmin: true,
      phase: 'phase-2',
    });
  });

  it('never sends money, Stripe or membership fields', () => {
    const payload = signupPayload('guest', '');
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
