/**
 * applications.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
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
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  ApplicationInput,
  getMyApplications,
  listHouseApplications,
  submitApplication,
  updateApplicationStatus,
} from '../applications';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

const input: ApplicationInput = {
  applicantName: 'Applicant A',
  applicantEmail: 'a@example.com',
  applicantPhone: '000',
  sobrietyDate: '2026-01-01',
  programType: 'other',
  currentSituation: 'situation',
  references: 'refs',
};

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: 'u1' });
});

describe('submitApplication', () => {
  it('refuses a signed-out caller before writing', async () => {
    setCurrentUser(null);

    await expect(submitApplication('h1', input)).rejects.toThrow('Must be signed in to apply');
    expect(getOpLog()).toEqual([]);
  });

  it('sets houses/{houseId}/applications/{auto id} as a pending application', async () => {
    const id = await submitApplication('h1', input);

    expect(id).toBe('auto-1');
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: 'houses/h1/applications/auto-1',
        data: {
          id: 'auto-1',
          houseId: 'h1',
          applicantUid: 'u1',
          ...input,
          status: 'pending',
          createdAt: ISO,
          updatedAt: ISO,
        },
      },
    ]);
    expect(readDoc('houses/h1/applications/auto-1')?.status).toBe('pending');
  });

  it('replaces a write failure with a generic message', async () => {
    failNext('set', new Error('denied'), 'houses/h1/applications/auto-1');

    await expect(submitApplication('h1', input)).rejects.toThrow(
      'Failed to submit application. Please try again.',
    );
  });
});

describe('listHouseApplications', () => {
  it('queries the house applications ordered by createdAt desc', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', createdAt: '2026-01-01' });
    seedDoc('houses/h1/applications/x2', { id: 'x2', createdAt: '2026-02-01' });
    seedDoc('houses/h2/applications/x3', { id: 'x3', createdAt: '2026-03-01' });

    const result = await listHouseApplications('h1');

    expect(result).toEqual([
      { id: 'x2', createdAt: '2026-02-01' },
      { id: 'x1', createdAt: '2026-01-01' },
    ]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'houses/h1/applications',
        constraints: [['orderBy', 'createdAt', 'desc']],
      },
    ]);
  });

  it('replaces a read failure with a generic message', async () => {
    failNext('getDocs', new Error('denied'), 'houses/h1/applications');

    await expect(listHouseApplications('h1')).rejects.toThrow('Failed to load applications.');
  });
});

describe('getMyApplications', () => {
  it('returns [] for a signed-out caller without reading', async () => {
    setCurrentUser(null);

    expect(await getMyApplications()).toEqual([]);
    expect(getOpLog()).toEqual([]);
  });

  it('queries the applications collection group by applicantUid', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', applicantUid: 'u1' });
    seedDoc('houses/h2/applications/x2', { id: 'x2', applicantUid: 'u2' });

    expect(await getMyApplications()).toEqual([{ id: 'x1', applicantUid: 'u1' }]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'applications',
        constraints: [['where', 'applicantUid', '==', 'u1']],
      },
    ]);
  });

  it('replaces a read failure with a generic message', async () => {
    failNext('getDocs', new Error('denied'), 'applications');

    await expect(getMyApplications()).rejects.toThrow('Failed to load your applications.');
  });
});

describe('updateApplicationStatus', () => {
  it('refuses a signed-out caller before writing', async () => {
    setCurrentUser(null);

    await expect(updateApplicationStatus('h1', 'x1', 'approved')).rejects.toThrow(
      'Must be signed in to update application status',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('updates status, an empty note, reviewedAt and reviewedBy', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', status: 'pending' });

    await updateApplicationStatus('h1', 'x1', 'approved');

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'houses/h1/applications/x1',
        data: { status: 'approved', operatorNote: '', reviewedAt: ISO, reviewedBy: 'u1' },
      },
    ]);
  });

  it('writes the operator note when one is given', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1' });

    await updateApplicationStatus('h1', 'x1', 'rejected', 'full');

    expect(getOpLog()[0].data).toEqual(
      expect.objectContaining({ status: 'rejected', operatorNote: 'full' }),
    );
    expect(readDoc('houses/h1/applications/x1')?.operatorNote).toBe('full');
  });

  it('replaces a failure (missing application) with a generic message', async () => {
    await expect(updateApplicationStatus('h1', 'missing', 'approved')).rejects.toThrow(
      'Failed to update application status.',
    );
    expect(getOpLog().map((e) => e.op)).toEqual(['update']);
  });
});
