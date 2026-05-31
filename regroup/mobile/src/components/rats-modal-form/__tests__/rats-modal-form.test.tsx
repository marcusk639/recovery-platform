/**
 * Tests for RatsModalForm component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';

jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, isVisible }: any) =>
      isVisible ? <View testID="modal">{children}</View> : null,
  };
});

jest.mock('../../rats-modal', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, isVisible, testID, onBackdropPress }: any) =>
      isVisible ? (
        <View testID={testID || 'rats-modal'} onTouchEnd={onBackdropPress}>
          {children}
        </View>
      ) : null,
  };
});

jest.mock('../../rats-loading-indicator/rats-loading-indicator', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="loading-indicator" />,
  };
});

jest.mock('../../rats-label/rats-label', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ label }: any) => <Text testID="form-header">{label}</Text>,
  };
});

jest.mock('../../rats-button/rats-button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ title, onPress, disabled, testID }: any) => (
      <TouchableOpacity
        testID={testID || 'rats-button'}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../styles', () => ({
  container: {},
  fieldContainer: {},
  buttonContainer: {},
}));

import RatsModalForm from '../rats-modal-form';

const defaultProps = {
  loading: false,
  visible: true,
  children: <Text>Form Content</Text>,
  modalStyle: {},
  onBackdropPress: jest.fn(),
  formHeader: 'Test Form Header',
  disableSubmit: false,
  onSubmit: jest.fn(),
  errorMessage: '',
  headerStyle: {},
};

describe('RatsModalForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing when visible', () => {
    const { toJSON } = render(<RatsModalForm {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the form header when not loading', () => {
    const { getByText } = render(<RatsModalForm {...defaultProps} />);
    expect(getByText('Test Form Header')).toBeTruthy();
  });

  it('renders children content when not loading', () => {
    const { getByText } = render(<RatsModalForm {...defaultProps} />);
    expect(getByText('Form Content')).toBeTruthy();
  });

  it('renders Submit button when not loading', () => {
    const { getByText } = render(<RatsModalForm {...defaultProps} />);
    expect(getByText('Submit')).toBeTruthy();
  });

  it('calls onSubmit when Submit button is pressed', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <RatsModalForm {...defaultProps} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when loading is true', () => {
    const { getByTestId } = render(
      <RatsModalForm {...defaultProps} loading={true} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('hides form content when loading is true', () => {
    const { queryByText } = render(
      <RatsModalForm {...defaultProps} loading={true} />,
    );
    expect(queryByText('Form Content')).toBeNull();
    expect(queryByText('Submit')).toBeNull();
  });

  it('does not render modal content when visible is false', () => {
    const { queryByText } = render(
      <RatsModalForm {...defaultProps} visible={false} />,
    );
    expect(queryByText('Test Form Header')).toBeNull();
  });

  it('renders submit button as disabled when disableSubmit is true', () => {
    const { getByTestId } = render(
      <RatsModalForm
        {...defaultProps}
        disableSubmit={true}
        submitButtonTestID="submit-btn"
      />,
    );
    const btn = getByTestId('submit-btn');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('uses testID prop on the modal', () => {
    const { getByTestId } = render(
      <RatsModalForm {...defaultProps} testID="my-modal-form" />,
    );
    expect(getByTestId('my-modal-form')).toBeTruthy();
  });

  it('uses submitButtonTestID prop on the submit button', () => {
    const { getByTestId } = render(
      <RatsModalForm {...defaultProps} submitButtonTestID="custom-submit" />,
    );
    expect(getByTestId('custom-submit')).toBeTruthy();
  });

  it('derives submit button testID from testID when submitButtonTestID is absent', () => {
    const { getByTestId } = render(
      <RatsModalForm {...defaultProps} testID="form-1" />,
    );
    expect(getByTestId('form-1-submit-button')).toBeTruthy();
  });
});
