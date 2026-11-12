import React from 'react';
import { Alert } from 'react-native';
import { keyboardAncestor } from '../../../components/rats-keyboard/__tests__/keyboardAncestor';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntakeFormScreen from '../IntakeFormScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { houseId: 'house-1' } }),
}));

const mockCreateGuest = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../state/queries/guestQueries', () => ({
  useCreateGuest: () => ({ mutateAsync: mockCreateGuest, isPending: false }),
}));

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1', name: 'Test House' },
    currentUser: { uid: 'admin-1' },
  }),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});

jest.mock('../../../components/screen-header/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ title }: any) => (
    <View>
      <Text>{title}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-step-indicator', () => {
  const { View, Text } = require('react-native');
  return ({ currentPosition, labels }: any) => (
    <View testID="step-indicator">
      <Text>{labels?.[currentPosition]?.label}</Text>
    </View>
  );
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('IntakeFormScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders step 1 with Personal Info', () => {
    const { getByText, getByPlaceholderText } = render(<IntakeFormScreen />, {
      wrapper,
    });
    expect(getByText('Personal Info')).toBeTruthy();
    expect(getByPlaceholderText('First Name')).toBeTruthy();
    expect(getByPlaceholderText('Last Name')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
  });

  it('advances to step 2 on Continue press', () => {
    const { getByText, getByPlaceholderText } = render(<IntakeFormScreen />, {
      wrapper,
    });
    fireEvent.changeText(getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@test.com');
    fireEvent.press(getByText('Continue'));
    expect(getByText('Emergency Contact')).toBeTruthy();
  });

  // The server carries a manager-set rent rate onto the resident's own
  // record only when createdBy names who made the intake record (the rules
  // bind it to the caller).
  it('records the staff member who made the intake record as createdBy', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByPlaceholderText, getByTestId } = render(<IntakeFormScreen />, {
      wrapper,
    });
    fireEvent.changeText(getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@test.com');
    for (let i = 0; i < 3; i++) {
      fireEvent.press(getByTestId('intake-continue-button'));
    }
    fireEvent.press(getByTestId('intake-submit-button'));

    await waitFor(() => expect(mockCreateGuest).toHaveBeenCalledTimes(1));
    const guest = mockCreateGuest.mock.calls[0][0];
    expect(guest.createdBy).toBe('admin-1');
    expect(guest.intakeCompletedBy).toBe('admin-1');
    expect(guest.userId).toBeFalsy();
  });
});

// ─── Keyboard (plan Task 15) ──────────────────────────────────────────────────
describe('IntakeFormScreen keyboard', () => {
  it('keeps its fields in a RatsScrollView (IQKeyboardManager-only before)', () => {
    const { getByPlaceholderText } = render(<IntakeFormScreen />, { wrapper });
    expect(keyboardAncestor(getByPlaceholderText('Email'))).toBe('RatsScrollView');
  });
});
