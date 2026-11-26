/**
 * P5 Task 16: a prospective resident's in-app application. Submitting goes to
 * the status screen for that application, in place of the form.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApplyScreen from '../ApplyScreen';
import { Routes } from '../../../navigation/types';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { houseId: 'house-1', houseName: 'Hope House' } }),
}));

const mockSubmit = jest.fn();
jest.mock('../../../services/applications', () => ({
  submitApplication: (...args: unknown[]) => mockSubmit(...args),
}));

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ApplyScreen />
    </QueryClientProvider>,
  );

const fillAndReachReview = (utils: ReturnType<typeof renderScreen>) => {
  fireEvent.changeText(utils.getByTestId('input-name'), 'Pat Lee');
  fireEvent.changeText(utils.getByTestId('input-email'), 'pat@rats-e2e.com');
  fireEvent.press(utils.getByTestId('btn-next'));
  fireEvent.press(utils.getByTestId('btn-next'));
};

describe('ApplyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('submits to the house and replaces itself with that application status', async () => {
    mockSubmit.mockResolvedValue('app-9');
    const utils = renderScreen();
    fillAndReachReview(utils);
    fireEvent.press(utils.getByTestId('btn-submit'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(Routes.ApplicationStatus, {
        houseId: 'house-1',
        houseName: 'Hope House',
        applicationId: 'app-9',
      }),
    );
    expect(mockSubmit).toHaveBeenCalledWith(
      'house-1',
      expect.objectContaining({ applicantName: 'Pat Lee', applicantEmail: 'pat@rats-e2e.com' }),
    );
  });

  it('stays on the form and says so when the submit fails', async () => {
    mockSubmit.mockRejectedValue(new Error('denied'));
    const utils = renderScreen();
    fillAndReachReview(utils);
    fireEvent.press(utils.getByTestId('btn-submit'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Could not submit application. Please try again.',
      ),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('refuses to submit without a name and email', () => {
    const utils = renderScreen();
    fireEvent.press(utils.getByTestId('btn-next'));
    fireEvent.press(utils.getByTestId('btn-next'));
    fireEvent.press(utils.getByTestId('btn-submit'));

    expect(Alert.alert).toHaveBeenCalledWith('Required', 'Name and email are required.');
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
