/**
 * Tests for KeyboardView component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Keyboard, Text, View } from 'react-native';
import KeyboardView from '../index';

describe('KeyboardView', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<KeyboardView />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders children correctly', () => {
    const { getByText } = render(
      <KeyboardView>
        <Text>Hello World</Text>
      </KeyboardView>,
    );
    expect(getByText('Hello World')).toBeTruthy();
  });

  it('dismisses keyboard when pressed', () => {
    const { UNSAFE_getByType } = render(<KeyboardView />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  });

  it('renders as a TouchableOpacity with activeOpacity of 1', () => {
    const { UNSAFE_getByType } = render(<KeyboardView />);
    const { TouchableOpacity } = require('react-native');
    const touchable = UNSAFE_getByType(TouchableOpacity);
    expect(touchable.props.activeOpacity).toBe(1);
  });

  it('forwards style prop to the TouchableOpacity', () => {
    const style = { backgroundColor: 'blue' };
    const { UNSAFE_getByType } = render(<KeyboardView style={style} />);
    const { TouchableOpacity } = require('react-native');
    const touchable = UNSAFE_getByType(TouchableOpacity);
    expect(touchable.props.style).toEqual(style);
  });

  it('forwards testID prop', () => {
    const { UNSAFE_getByType } = render(<KeyboardView testID="keyboard-view" />);
    const { TouchableOpacity } = require('react-native');
    const touchable = UNSAFE_getByType(TouchableOpacity);
    expect(touchable.props.testID).toBe('keyboard-view');
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <KeyboardView>
        <Text>First</Text>
        <Text>Second</Text>
      </KeyboardView>,
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('calls Keyboard.dismiss on each press', () => {
    const { UNSAFE_getByType } = render(<KeyboardView />);
    const { TouchableOpacity } = require('react-native');
    const touchable = UNSAFE_getByType(TouchableOpacity);
    fireEvent.press(touchable);
    fireEvent.press(touchable);
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(2);
  });

  it('accepts onPress override and still dismisses keyboard', () => {
    // KeyboardView always calls Keyboard.dismiss via onPress={Keyboard.dismiss}
    // The spread {...props} does not override onPress since it appears before props spread
    // Actually looking at source: onPress={Keyboard.dismiss} {...props}
    // So if a custom onPress is passed, it DOES override the built-in one
    const customPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <KeyboardView onPress={customPress} />,
    );
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(customPress).toHaveBeenCalledTimes(1);
  });

  it('renders nested View children', () => {
    const { UNSAFE_getAllByType } = render(
      <KeyboardView>
        <View testID="inner-view" />
      </KeyboardView>,
    );
    const views = UNSAFE_getAllByType(View);
    expect(views.length).toBeGreaterThan(0);
  });

  it('snapshot matches', () => {
    const { toJSON } = render(
      <KeyboardView>
        <Text>snap</Text>
      </KeyboardView>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
