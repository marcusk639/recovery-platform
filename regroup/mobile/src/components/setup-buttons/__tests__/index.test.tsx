import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SetupButtons from '../index';

describe('SetupButtons', () => {
  it('renders Back and Next buttons by default', () => {
    const { getByTestId } = render(
      <SetupButtons onBackPress={jest.fn()} onNextPress={jest.fn()} />,
    );
    expect(getByTestId('setup-buttons-back')).toBeTruthy();
    expect(getByTestId('setup-buttons-next')).toBeTruthy();
  });

  it('calls onBackPress when Back is tapped', () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <SetupButtons onBackPress={onBack} onNextPress={jest.fn()} />,
    );
    fireEvent.press(getByTestId('setup-buttons-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onNextPress when Next is tapped', () => {
    const onNext = jest.fn();
    const { getByTestId } = render(
      <SetupButtons onBackPress={jest.fn()} onNextPress={onNext} />,
    );
    fireEvent.press(getByTestId('setup-buttons-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does not call onNextPress when nextDisabled is true', () => {
    const onNext = jest.fn();
    const { getByTestId } = render(
      <SetupButtons
        onBackPress={jest.fn()}
        onNextPress={onNext}
        nextDisabled
      />,
    );
    fireEvent.press(getByTestId('setup-buttons-next'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('hides Back when hideBack is true', () => {
    const { queryByTestId } = render(
      <SetupButtons onBackPress={jest.fn()} onNextPress={jest.fn()} hideBack />,
    );
    expect(queryByTestId('setup-buttons-back')).toBeNull();
  });

  it('renders ActivityIndicator instead of Next when isLoading is true', () => {
    const { queryByTestId, UNSAFE_getByType } = render(
      <SetupButtons
        onBackPress={jest.fn()}
        onNextPress={jest.fn()}
        isLoading
      />,
    );
    expect(queryByTestId('setup-buttons-next')).toBeNull();
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('respects custom backLabel and nextLabel props', () => {
    const { getByText } = render(
      <SetupButtons
        onBackPress={jest.fn()}
        onNextPress={jest.fn()}
        backLabel="Cancel"
        nextLabel="Finish"
      />,
    );
    // RatsButton uppercases via RatsText toUpper={true}
    expect(getByText('CANCEL')).toBeTruthy();
    expect(getByText('FINISH')).toBeTruthy();
  });
});
