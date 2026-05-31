import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ConfirmationButtons from '../index';

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

describe('ConfirmationButtons', () => {
  const defaultProps = {
    confirm: jest.fn(),
    cancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ConfirmationButtons {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders default CANCEL button text', () => {
    const { getByText } = render(<ConfirmationButtons {...defaultProps} />);
    expect(getByText('CANCEL')).toBeTruthy();
  });

  it('renders default SAVE button text', () => {
    const { getByText } = render(<ConfirmationButtons {...defaultProps} />);
    expect(getByText('SAVE')).toBeTruthy();
  });

  it('renders custom cancelButtonText', () => {
    const { getByText } = render(
      <ConfirmationButtons {...defaultProps} cancelButtonText="GO BACK" />,
    );
    expect(getByText('GO BACK')).toBeTruthy();
  });

  it('renders custom confirmButtonText', () => {
    const { getByText } = render(
      <ConfirmationButtons {...defaultProps} confirmButtonText="CONFIRM" />,
    );
    expect(getByText('CONFIRM')).toBeTruthy();
  });

  it('calls cancel when the cancel button is pressed', () => {
    const cancel = jest.fn();
    const { getByText } = render(
      <ConfirmationButtons confirm={jest.fn()} cancel={cancel} />,
    );
    fireEvent.press(getByText('CANCEL'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('calls confirm when the save button is pressed', () => {
    const confirm = jest.fn();
    const { getByText } = render(
      <ConfirmationButtons confirm={confirm} cancel={jest.fn()} />,
    );
    fireEvent.press(getByText('SAVE'));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does not call confirm when cancel is pressed', () => {
    const confirm = jest.fn();
    const cancel = jest.fn();
    const { getByText } = render(
      <ConfirmationButtons confirm={confirm} cancel={cancel} />,
    );
    fireEvent.press(getByText('CANCEL'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not call cancel when confirm is pressed', () => {
    const confirm = jest.fn();
    const cancel = jest.fn();
    const { getByText } = render(
      <ConfirmationButtons confirm={confirm} cancel={cancel} />,
    );
    fireEvent.press(getByText('SAVE'));
    expect(cancel).not.toHaveBeenCalled();
  });

  it('applies confirmTestID to the confirm button', () => {
    const { getByTestId } = render(
      <ConfirmationButtons
        {...defaultProps}
        confirmTestID="confirm-btn"
      />,
    );
    expect(getByTestId('confirm-btn')).toBeTruthy();
  });

  it('applies cancelTestID to the cancel button', () => {
    const { getByTestId } = render(
      <ConfirmationButtons
        {...defaultProps}
        cancelTestID="cancel-btn"
      />,
    );
    expect(getByTestId('cancel-btn')).toBeTruthy();
  });

  it('accepts a custom container style', () => {
    const { toJSON } = render(
      <ConfirmationButtons
        {...defaultProps}
        container={{ marginTop: 20 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders both buttons side by side (two touchables)', () => {
    const { UNSAFE_getAllByType } = render(
      <ConfirmationButtons {...defaultProps} />,
    );
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    expect(touchables.length).toBeGreaterThanOrEqual(2);
  });
});
