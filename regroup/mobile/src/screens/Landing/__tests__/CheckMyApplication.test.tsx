/**
 * Owner decision 2026-11-27 (Q2): an applicant on the app's anonymous session
 * gets back to their application from the landing screen.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckMyApplication from '../CheckMyApplication';
import { Routes } from '../../../navigation/types';
import { auth as mockAuth } from '../../../../firebase-setup';

const auth = mockAuth as { currentUser: unknown };

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

let mockUser: { uid: string; isAnonymous: boolean } | null = null;
jest.mock('../../../state/store', () => ({
  useAppSelector: (select: (s: unknown) => unknown) => select({ user: { user: mockUser } }),
}));

const mockGetMyApplications = jest.fn();
jest.mock('../../../services/applications', () => ({
  getMyApplications: (...args: unknown[]) => mockGetMyApplications(...args),
}));

const renderIt = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CheckMyApplication />
    </QueryClientProvider>,
  );

const signInAs = (user: { uid: string; isAnonymous: boolean } | null) => {
  mockUser = user;
  auth.currentUser = user;
};

describe('CheckMyApplication', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => signInAs(null));

  it('opens the latest application of this device', async () => {
    signInAs({ uid: 'anon-1', isAnonymous: true });
    mockGetMyApplications.mockResolvedValue([
      { id: 'h1_anon-1', houseId: 'h1', createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'h2_anon-1', houseId: 'h2', createdAt: '2026-11-20T00:00:00.000Z' },
    ]);
    const { findByTestId } = renderIt();

    fireEvent.press(await findByTestId('check-application-button'));
    expect(mockNavigate).toHaveBeenCalledWith(Routes.ApplicationStatus, {
      houseId: 'h2',
      applicationId: 'h2_anon-1',
    });
  });

  it('shows nothing when this device has not applied', async () => {
    signInAs({ uid: 'anon-1', isAnonymous: true });
    mockGetMyApplications.mockResolvedValue([]);
    const { queryByTestId } = renderIt();

    await waitFor(() => expect(mockGetMyApplications).toHaveBeenCalled());
    expect(queryByTestId('check-application-button')).toBeNull();
  });

  it('shows nothing, and asks nothing, for an account that is not anonymous', () => {
    signInAs({ uid: 'u1', isAnonymous: false });
    const { queryByTestId } = renderIt();

    expect(mockGetMyApplications).not.toHaveBeenCalled();
    expect(queryByTestId('check-application-button')).toBeNull();
  });

  it('shows nothing when the list cannot be read', async () => {
    signInAs({ uid: 'anon-1', isAnonymous: true });
    mockGetMyApplications.mockRejectedValue(new Error('denied'));
    const { queryByTestId } = renderIt();

    await waitFor(() => expect(mockGetMyApplications).toHaveBeenCalled());
    expect(queryByTestId('check-application-button')).toBeNull();
  });
});
