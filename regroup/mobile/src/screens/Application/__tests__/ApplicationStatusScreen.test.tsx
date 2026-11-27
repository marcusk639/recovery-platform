/**
 * P5 Task 16: after submitting, the applicant sees that application's status,
 * read by its path (the applications read rule allows the applicant's own).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApplicationStatusScreen from '../ApplicationStatusScreen';
import { Routes } from '../../../navigation/types';
import { auth as mockAuth } from '../../../../firebase-setup';

// The unit mock's auth is a plain object; the real type marks currentUser read-only.
const auth = mockAuth as { currentUser: unknown };

const mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockParams }),
}));

const mockGetApplication = jest.fn();
const mockGetMyApplications = jest.fn();
jest.mock('../../../services/applications', () => ({
  getApplication: (...args: unknown[]) => mockGetApplication(...args),
  getMyApplications: (...args: unknown[]) => mockGetMyApplications(...args),
}));

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApplicationStatusScreen />
    </QueryClientProvider>,
  );

describe('ApplicationStatusScreen', () => {
  afterEach(() => {
    auth.currentUser = null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { houseId: 'house-1', houseName: 'Hope House', applicationId: 'app-9' };
  });

  it('shows the submitted application as pending, read by its id', async () => {
    mockGetApplication.mockResolvedValue({ id: 'app-9', houseId: 'house-1', status: 'pending' });
    const { findByText, getByTestId } = renderScreen();

    expect(await findByText('Pending Review')).toBeTruthy();
    expect(getByTestId('application-status-badge')).toBeTruthy();
    expect(mockGetApplication).toHaveBeenCalledWith('house-1', 'app-9');
    // The list isn't needed when the id is known.
    expect(mockGetMyApplications).not.toHaveBeenCalled();
  });

  it("shows the operator's note once approved", async () => {
    mockGetApplication.mockResolvedValue({
      id: 'app-9',
      houseId: 'house-1',
      status: 'approved',
      operatorNote: 'Welcome',
    });
    const { findByText } = renderScreen();

    expect(await findByText('Approved!')).toBeTruthy();
    expect(await findByText('Welcome')).toBeTruthy();
  });

  // Review: a failed read is not "not found".
  it('says the status could not be loaded when the read fails', async () => {
    mockGetApplication.mockRejectedValue(new Error('Failed to load the application.'));
    const { findByText, queryByText } = renderScreen();

    expect(await findByText("Couldn't load your application's status. Try again later.")).toBeTruthy();
    expect(queryByText('Pending Review')).toBeNull();
  });

  it('says it was received when the application cannot be found', async () => {
    mockGetApplication.mockResolvedValue(null);
    const { findByText } = renderScreen();

    expect(await findByText('Application Submitted')).toBeTruthy();
  });

  it('goes back to house search, inside the signed-out stack', async () => {
    mockGetApplication.mockResolvedValue({ id: 'app-9', houseId: 'house-1', status: 'pending' });
    const { findByText } = renderScreen();
    fireEvent.press(await findByText('Apply to Another House'));

    expect(mockNavigate).toHaveBeenCalledWith(Routes.PriorAuth, { screen: Routes.HouseSearch });
  });

  it('falls back to the list of my applications without an id', async () => {
    mockParams = { houseId: 'house-1' };
    auth.currentUser = { uid: 'anon-1' };
    mockGetMyApplications.mockResolvedValue([
      { id: 'a', houseId: 'house-2', status: 'approved' },
      { id: 'b', houseId: 'house-1', status: 'rejected' },
    ]);
    const { findByText } = renderScreen();

    await waitFor(() => expect(mockGetMyApplications).toHaveBeenCalled());
    expect(await findByText('Not Selected')).toBeTruthy();
    expect(mockGetApplication).not.toHaveBeenCalled();
  });
});
