/**
 * P5 Task 16: approving an application opens intake pre-filled with what the
 * applicant entered (ApplicationDetail passes applicationId).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntakeFormScreen from '../IntakeFormScreen';
import { prefillFromApplication } from '../prefillFromApplication';

let mockParams: Record<string, string> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));

jest.mock('../../../state/queries/guestQueries', () => ({
  useCreateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ currentUser: { uid: 'admin-1' } }),
}));

const mockGetApplication = jest.fn();
jest.mock('../../../services/applications', () => ({
  getApplication: (...args: unknown[]) => mockGetApplication(...args),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});
jest.mock('../../../components/screen-header/screen-header', () => () => null);
jest.mock('../../../components/rats-step-indicator', () => () => null);

const APPLICATION = {
  id: 'app-1',
  houseId: 'house-1',
  applicantName: 'Pat  Van Lee',
  applicantEmail: 'pat@rats-e2e.com',
  applicantPhone: '512-555-0100',
  sobrietyDate: '2026-01-01',
};

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntakeFormScreen />
    </QueryClientProvider>,
  );

describe('IntakeFormScreen pre-fill from an application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApplication.mockResolvedValue(APPLICATION);
  });

  it('reads the application and fills the shared fields', async () => {
    mockParams = { houseId: 'house-1', applicationId: 'app-1' };
    const { getByTestId } = renderScreen();

    await waitFor(() => expect(getByTestId('intake-first-name-input').props.value).toBe('Pat'));
    expect(mockGetApplication).toHaveBeenCalledWith('house-1', 'app-1');
    expect(getByTestId('intake-last-name-input').props.value).toBe('Van Lee');
    expect(getByTestId('intake-email-input').props.value).toBe('pat@rats-e2e.com');
    expect(getByTestId('intake-phone-input').props.value).toBe('512-555-0100');
    expect(getByTestId('intake-sobriety-date-input').props.value).toBe('2026-01-01');
  });

  it('keeps what staff typed before the application arrived', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGetApplication.mockReturnValue(new Promise((r) => (resolve = r)));
    mockParams = { houseId: 'house-1', applicationId: 'app-1' };
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('intake-first-name-input'), 'Patricia');
    resolve(APPLICATION);

    await waitFor(() => expect(getByTestId('intake-last-name-input').props.value).toBe('Van Lee'));
    expect(getByTestId('intake-first-name-input').props.value).toBe('Patricia');
  });

  it('reads nothing without an application id', () => {
    mockParams = { houseId: 'house-1' };
    const { getByTestId } = renderScreen();

    expect(mockGetApplication).not.toHaveBeenCalled();
    expect(getByTestId('intake-first-name-input').props.value).toBe('');
  });
});

describe('prefillFromApplication', () => {
  it('splits a one-word name into a first name only', () => {
    expect(prefillFromApplication({ applicantName: 'Cher' } as any)).toMatchObject({
      firstName: 'Cher',
      lastName: '',
    });
  });

  it('tolerates missing fields', () => {
    expect(prefillFromApplication({} as any)).toEqual({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      sobrietyDate: '',
    });
  });
});
