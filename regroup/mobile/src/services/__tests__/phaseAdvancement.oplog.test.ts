/**
 * phaseAdvancement.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import { advanceGuestPhase, checkAdvancementEligibility } from '../phaseAdvancement';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { logException } from '../../util/logging';

const NOW = '2026-10-07T17:00:00.000Z';

const rules = { meetings: 3, work: 0, chore: false, medications: false, supporter: false };
const house = {
  id: 'h1',
  phases: {
    one: { name: 'one', order: 1, rules },
    two: { name: 'two', order: 2, rules },
  },
} as unknown as House;
const guest = (phase: string) =>
  ({ id: 'g1', phase, displayName: 'Resident A' }) as unknown as Guest;

const stats = (meetingsAttended: number) => ({
  meetingsAttended,
  hoursWorked: 0,
  choresCompleted: 0,
  medicationTaken: 0,
  primarySupporterMet: 0,
});

const WEEKS_QUERY = (limit: number) => ({
  op: 'getDocs',
  path: 'week-summaries',
  constraints: [
    ['where', 'guestId', '==', 'g1'],
    ['orderBy', 'startDate', 'desc'],
    ['limit', limit],
  ],
});

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('checkAdvancementEligibility', () => {
  it('reads the latest N week summaries and is eligible after N compliant weeks', async () => {
    seedQuery('week-summaries', [
      { id: 'w1', guestId: 'g1', startDate: '2026-09-27', stats: stats(3) },
      { id: 'w2', guestId: 'g1', startDate: '2026-10-04', stats: stats(4) },
      { id: 'w3', guestId: 'g2', startDate: '2026-10-04', stats: stats(0) },
    ]);

    expect(await checkAdvancementEligibility(guest('one'), house, 2)).toEqual({
      eligible: true,
      guestId: 'g1',
      guestName: 'Resident A',
      currentPhase: 'one',
      nextPhase: 'two',
      compliantWeeks: 2,
      requiredWeeks: 2,
      isMaxPhase: false,
    });
    expect(getOpLog()).toEqual([WEEKS_QUERY(2)]);
  });

  it('stops counting at the newest non-compliant week (default 4 weeks)', async () => {
    seedQuery('week-summaries', [
      { id: 'w1', guestId: 'g1', startDate: '2026-09-27', stats: stats(3) },
      { id: 'w2', guestId: 'g1', startDate: '2026-10-04', stats: stats(1) },
    ]);

    const result = await checkAdvancementEligibility(guest('one'), house);

    expect(result.eligible).toBe(false);
    expect(result.compliantWeeks).toBe(0);
    expect(getOpLog()).toEqual([WEEKS_QUERY(4)]);
  });

  it('makes no read for a guest on the highest phase', async () => {
    const result = await checkAdvancementEligibility(guest('two'), house);

    expect(result).toMatchObject({ eligible: false, isMaxPhase: true, nextPhase: null });
    expect(getOpLog()).toEqual([]);
  });

  it('logs a failed read and returns the not-eligible base', async () => {
    const error = new Error('unavailable');
    failNext('getDocs', error, 'week-summaries');

    const result = await checkAdvancementEligibility(guest('one'), house);

    expect(result).toMatchObject({ eligible: false, compliantWeeks: 0, nextPhase: 'two' });
    expect(logException).toHaveBeenCalledWith(error);
  });
});

describe('advanceGuestPhase', () => {
  it('updates guests/{id} with the phase and updatedAt', async () => {
    jest.useFakeTimers({ now: new Date(NOW) });
    seedDoc('guests/g1', { phase: 'one' });

    await advanceGuestPhase('g1', 'two');

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'guests/g1', data: { phase: 'two', updatedAt: NOW } },
    ]);
    expect(readDoc('guests/g1')).toEqual({ phase: 'two', updatedAt: NOW });
  });

  it('rejects for a missing guest', async () => {
    await expect(advanceGuestPhase('gone', 'two')).rejects.toThrow('not-found');
  });
});
