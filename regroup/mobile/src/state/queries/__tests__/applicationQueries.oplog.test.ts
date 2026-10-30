/**
 * applicationQueries.ts hooks against the normalized Firebase operation log,
 * through the real services/applications module.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. The hooks read auth.currentUser from
 * firebase-setup; the auth mock's signed-in user is set per case.
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () =>
  require('../../../../__mocks__/firebase-modular/auth'),
);
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getOpLog, readDoc, resetOpLog, seedDoc } from '../../../../__mocks__/firebase-modular/log';
import {
  useHouseApplications,
  useMyApplications,
  useSubmitApplication,
  useUpdateApplicationStatus,
} from '../applicationQueries';
import { ApplicationInput } from '../../../services/applications';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

// Deliver query notifications synchronously, inside act().
notifyManager.setScheduler((callback) => callback());

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: 'u1' });
  client = new QueryClient({
    // gcTime Infinity schedules no garbage-collection timer to outlive the test.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});

afterEach(() => {
  client.clear();
  client.unmount();
});

describe('useMyApplications', () => {
  it('queries the applications collection group by the signed-in uid', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', applicantUid: 'u1' });
    seedDoc('houses/h2/applications/x2', { id: 'x2', applicantUid: 'u2' });

    const { result } = renderHook(() => useMyApplications(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'x1', applicantUid: 'u1' }]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'applications',
        constraints: [['where', 'applicantUid', '==', 'u1']],
      },
    ]);
  });

  it('does not query when signed out', async () => {
    setCurrentUser(null);

    renderHook(() => useMyApplications(), { wrapper });
    await act(async () => {});

    expect(getOpLog()).toEqual([]);
  });
});

describe('useHouseApplications', () => {
  it('queries the house applications ordered by createdAt desc', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', createdAt: '2026-01-01' });

    const { result } = renderHook(() => useHouseApplications('h1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'x1', createdAt: '2026-01-01' }]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'houses/h1/applications',
        constraints: [['orderBy', 'createdAt', 'desc']],
      },
    ]);
  });

  it('does not query without a house id', async () => {
    renderHook(() => useHouseApplications(''), { wrapper });
    await act(async () => {});

    expect(getOpLog()).toEqual([]);
  });
});

describe('useSubmitApplication', () => {
  it('sets a pending application under the house and returns its id', async () => {
    const data: ApplicationInput = {
      applicantName: 'Applicant A',
      applicantEmail: 'a@example.com',
      applicantPhone: '000',
      sobrietyDate: '2026-01-01',
      programType: 'other',
      currentSituation: 'situation',
      references: 'refs',
    };
    const { result } = renderHook(() => useSubmitApplication(), { wrapper });

    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({ houseId: 'h1', data });
    });

    expect(id).toBe('auto-1');
    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: 'houses/h1/applications/auto-1',
        data: {
          id: 'auto-1',
          houseId: 'h1',
          applicantUid: 'u1',
          ...data,
          status: 'pending',
          createdAt: ISO,
          updatedAt: ISO,
        },
      },
    ]);
  });
});

describe('useUpdateApplicationStatus', () => {
  it('updates the application status with the reviewer uid', async () => {
    seedDoc('houses/h1/applications/x1', { id: 'x1', status: 'pending' });
    const { result } = renderHook(() => useUpdateApplicationStatus('h1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ appId: 'x1', status: 'approved', note: 'ok' });
    });

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'houses/h1/applications/x1',
        data: { status: 'approved', operatorNote: 'ok', reviewedAt: ISO, reviewedBy: 'u1' },
      },
    ]);
    expect(readDoc('houses/h1/applications/x1')?.status).toBe('approved');
  });

  it('surfaces the service error for a missing application', async () => {
    const { result } = renderHook(() => useUpdateApplicationStatus('h1'), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ appId: 'missing', status: 'approved' }),
      ).rejects.toThrow('Failed to update application status.');
    });
  });
});
