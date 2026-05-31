import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntakeFormScreen from '../IntakeFormScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { houseId: 'house-1' } }),
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
});
