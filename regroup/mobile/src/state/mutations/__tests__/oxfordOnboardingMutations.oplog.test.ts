/**
 * oxfordOnboardingMutations.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
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

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../../__mocks__/firebase-modular/log';
import { OxfordOnboardingPayload, useCompleteOxfordOnboarding } from '../oxfordOnboardingMutations';

const SERVER_TS = { __fv: 'serverTimestamp' };

const payload: OxfordOnboardingPayload = {
  houseId: 'h1',
  officers: [
    { role: 'president', name: 'N1' },
    { role: 'treasurer', name: 'N2' },
  ],
  firstMeeting: { scheduledDate: '2026-11-01' },
  eesMonthlyAmount: 25,
};

// Deliver query notifications synchronously, inside act().
notifyManager.setScheduler((callback) => callback());

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

async function complete(input: OxfordOnboardingPayload) {
  const { result } = renderHook(() => useCompleteOxfordOnboarding(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(input);
  });
}

beforeEach(() => {
  resetOpLog();
  // gcTime Infinity schedules no garbage-collection timer to outlive the test.
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  client.clear();
  client.unmount();
});

describe('useCompleteOxfordOnboarding', () => {
  it('batch-sets officers by role and the onboarding meeting, updates the house, commits', async () => {
    seedDoc('houses/h1', { id: 'h1' });

    await complete(payload);

    expect(getOpLog()).toEqual([
      {
        op: 'batch.set',
        path: 'houses/h1/officers/president',
        data: {
          role: 'president',
          name: 'N1',
          houseId: 'h1',
          isActive: true,
          createdAt: SERVER_TS,
        },
      },
      {
        op: 'batch.set',
        path: 'houses/h1/officers/treasurer',
        data: {
          role: 'treasurer',
          name: 'N2',
          houseId: 'h1',
          isActive: true,
          createdAt: SERVER_TS,
        },
      },
      {
        op: 'batch.set',
        path: 'houses/h1/business-meetings/onboarding',
        data: {
          houseId: 'h1',
          scheduledDate: '2026-11-01',
          agenda: [],
          attendees: [],
          quorumMet: false,
          createdBy: 'onboarding',
          createdAt: SERVER_TS,
        },
      },
      {
        op: 'batch.update',
        path: 'houses/h1',
        data: { eesMonthlyAmount: 25, oxfordOnboardingComplete: true },
      },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('houses/h1')).toEqual({
      id: 'h1',
      eesMonthlyAmount: 25,
      oxfordOnboardingComplete: true,
    });
  });

  it('writes only the meeting and the house when there are no officers', async () => {
    seedDoc('houses/h1', { id: 'h1' });

    await complete({ ...payload, officers: [] });

    expect(getOpLog().map((e) => e.path)).toEqual([
      'houses/h1/business-meetings/onboarding',
      'houses/h1',
      '',
    ]);
  });

  it('rejects when the commit fails and stores nothing', async () => {
    seedDoc('houses/h1', { id: 'h1' });
    failNext('batch.commit', new Error('denied'));

    await expect(complete(payload)).rejects.toThrow('denied');
    expect(readDoc('houses/h1/officers/president')).toBeUndefined();
  });
});
