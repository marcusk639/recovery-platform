import { h, resetHarness } from './deletionHarness';

jest.mock('firebase-admin', () => require('./deletionHarness').adminModule);
jest.mock('firebase-functions/v2', () => require('./deletionHarness').functionsModule);
jest.mock('../../api/firestore', () => require('./deletionHarness').firestoreModule);
jest.mock('../../api/stripeDeletion', () => require('./deletionHarness').stripeModule);
jest.mock('../../accountDeletion/operatorRecords', () => require('./deletionHarness').operatorModule);
jest.mock('../../accountDeletion/memberRecords', () => require('./deletionHarness').memberModule);
jest.mock('../../accountDeletion/personalData', () => require('./deletionHarness').personalModule);

import { logger } from 'firebase-functions/v2';
import { runAccountDeletion } from '../../accountDeletion';

const NOW = '2026-10-20T00:00:00.000Z';
const LATER = '2026-10-21T00:00:00.000Z';
const ALL = ['operator', 'members', 'personal', 'userDoc', 'auth'];

const failure = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e as any,
  );

beforeEach(() => {
  resetHarness();
  h.discharge.mockImplementation(async (id: string) => {
    delete h.guests[id];
  });
});

describe('runAccountDeletion partial reporting', () => {
  it('reports partial when the operator step fails after cancelling the subscription', async () => {
    h.users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };
    h.houses = { h1: { ownerId: 'u1' } };
    h.closeOperator.mockImplementationOnce(async () => {
      h.calls.push('cancel:sub_1');
      throw new Error('house close failed');
    });

    const err = await failure(runAccountDeletion('u1', NOW));

    expect(err).toMatchObject({ step: 'operator', partial: true });
    expect(h.deletions.u1.completed).toEqual([]);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('reports partial for a failing personal step even when earlier steps were no-ops', async () => {
    // A user with no records: operator and members are skipped, personal is the first that acts.
    h.deletePersonal.mockRejectedValueOnce(new Error('x'));
    const err = await failure(runAccountDeletion('u1', NOW));
    expect(err).toMatchObject({ step: 'personal', partial: true });
    expect(h.closeOperator).not.toHaveBeenCalled();
  });
});

describe('runAccountDeletion re-runs completed steps for new data', () => {
  it('discharges a guest admitted after the members step completed', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.deletePersonal.mockRejectedValueOnce(new Error('storage down'));
    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('storage down');
    expect(h.deletions.u1.completed).toEqual(['operator', 'members']);

    h.guests.g3 = { userId: 'u1', houseId: 'h3' };
    h.calls.length = 0;
    const result = await runAccountDeletion('u1', LATER);

    expect(h.calls).toEqual(['discharge:g1', 'discharge:g3', 'personal', 'userDoc', 'auth']);
    expect(h.deletePersonal).toHaveBeenLastCalledWith('u1', ['g1', 'g3'], { g1: 'h1', g3: 'h3' });
    expect(result.completed).toEqual(['operator', 'members', 'personal', 'userDoc', 'auth']);
    expect(h.deletions.u1.completed).toEqual(['operator', 'members', 'personal', 'userDoc', 'auth']);
  });

  it('re-runs personal when a completed run finds a new guest id', async () => {
    h.userDelete.mockRejectedValueOnce(new Error('boom'));
    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('boom');
    expect(h.deletions.u1.completed).toEqual(['operator', 'members', 'personal']);

    h.archive = { old1: { userId: 'u1', houseId: 'h9' } };
    h.calls.length = 0;
    await runAccountDeletion('u1', LATER);

    expect(h.calls).toEqual(['scrubArchive:old1', 'personal', 'userDoc', 'auth']);
    expect(h.deletePersonal).toHaveBeenLastCalledWith('u1', ['old1'], { old1: 'h9' });
  });

  it('runs the operator step when operator data appears on resume', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.deletePersonal.mockRejectedValueOnce(new Error('storage down'));
    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('storage down');
    expect(h.closeOperator).not.toHaveBeenCalled();

    h.houses = { h5: { ownerId: 'u1' } };
    h.calls.length = 0;
    const result = await runAccountDeletion('u1', LATER);

    expect(h.closeOperator).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['operator', 'personal', 'userDoc', 'auth']);
    expect(h.deletions.u1.targets).toMatchObject({ ownsHouses: true });
    expect([...result.completed].sort()).toEqual([...ALL].sort());
  });

  it('does not re-run completed steps when nothing new is found', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.deletePersonal.mockRejectedValueOnce(new Error('storage down'));
    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('storage down');

    h.calls.length = 0;
    await runAccountDeletion('u1', LATER);
    expect(h.calls).toEqual(['personal', 'userDoc', 'auth']);
    expect(h.discharge).toHaveBeenCalledTimes(1);
  });
});

describe('runAccountDeletion targets write', () => {
  it('logs and tags a failed targets write, runs no step, and recovers on retry', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.failWriteWhen = (d) => 'targets' in d;

    const err = await failure(runAccountDeletion('u1', NOW));

    expect(err).toMatchObject({ message: 'progress write failed', step: 'targets', partial: false });
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion: step failed',
      expect.objectContaining({ step: 'targets', phase: 'record' }),
    );
    expect(h.deletions.u1.lastError).toBe('targets');
    expect(h.calls).toEqual([]);

    h.failWriteWhen = null;
    const result = await runAccountDeletion('u1', LATER);
    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1.targets).toMatchObject({ guestIds: ['g1'] });
  });
});
