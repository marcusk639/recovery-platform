// Intake admits a resident once, however fast Submit is pressed (#217).
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import IntakeFormScreen from '../IntakeFormScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: { houseId: 'house-1' } }),
}));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ currentUser: { uid: 'admin-1' } }),
}));
jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});
jest.mock('../../../components/screen-header/screen-header', () => () => null);
jest.mock('../../../components/rats-step-indicator', () => () => null);

// isPending never flips here, which is the race: the second click lands
// before the re-render that would disable the button.
const mockCreateGuest = jest.fn();
jest.mock('../../../state/queries/guestQueries', () => ({
  useCreateGuest: () => ({ mutateAsync: mockCreateGuest, isPending: false }),
}));

const toLastStep = () => {
  const utils = render(<IntakeFormScreen />);
  fireEvent.changeText(utils.getByPlaceholderText('First Name'), 'John');
  fireEvent.changeText(utils.getByPlaceholderText('Last Name'), 'Doe');
  fireEvent.changeText(utils.getByPlaceholderText('Email'), 'john@test.com');
  for (let i = 0; i < 3; i++) fireEvent.press(utils.getByTestId('intake-continue-button'));
  return utils;
};

describe('IntakeFormScreen submit (#217)', () => {
  beforeEach(() => {
    mockCreateGuest.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('creates one resident when Submit is pressed twice before the save finishes', async () => {
    let finish: (value: unknown) => void = () => {};
    mockCreateGuest.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const { getByTestId } = toLastStep();

    fireEvent.press(getByTestId('intake-submit-button'));
    fireEvent.press(getByTestId('intake-submit-button'));
    finish({});

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Success', expect.any(String), expect.any(Array)));
    expect(mockCreateGuest).toHaveBeenCalledTimes(1);
  });

  it('lets Submit work again after a failed save', async () => {
    mockCreateGuest.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    const { getByTestId } = toLastStep();

    fireEvent.press(getByTestId('intake-submit-button'));
    await waitFor(() => expect(mockCreateGuest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String)));
    fireEvent.press(getByTestId('intake-submit-button'));
    await waitFor(() => expect(mockCreateGuest).toHaveBeenCalledTimes(2));
  });
});
