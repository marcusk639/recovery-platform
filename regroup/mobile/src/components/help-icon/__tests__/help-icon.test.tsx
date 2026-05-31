/**
 * Tests for HelpIcon component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HelpIcon from '../index';

// RatsIcon uses FontAwesome5 from react-native-vector-icons
jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

// rats-icon imports useNavigation - mock it
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({}),
  DrawerActions: { openDrawer: jest.fn() },
}));

describe('HelpIcon', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<HelpIcon />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a TouchableOpacity', () => {
    const { UNSAFE_getByType } = render(<HelpIcon />);
    const { TouchableOpacity } = require('react-native');
    expect(UNSAFE_getByType(TouchableOpacity)).toBeTruthy();
  });

  it('calls helpFn when pressed', () => {
    const helpFn = jest.fn();
    const { UNSAFE_getByType } = render(<HelpIcon helpFn={helpFn} />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(helpFn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when pressed without helpFn prop', () => {
    const { UNSAFE_getByType } = render(<HelpIcon />);
    const { TouchableOpacity } = require('react-native');
    expect(() => fireEvent.press(UNSAFE_getByType(TouchableOpacity))).not.toThrow();
  });

  it('calls setRef callback with a ref value on mount', () => {
    const setRef = jest.fn();
    render(<HelpIcon setRef={setRef} />);
    // setRef is called with the ref during mount (may be null in test env)
    expect(setRef).toHaveBeenCalled();
  });

  it('renders the RatsIcon (FontAwesome5) component', () => {
    const { UNSAFE_getAllByType } = render(<HelpIcon />);
    expect(UNSAFE_getAllByType('FontAwesome5Icon' as any).length).toBeGreaterThan(0);
  });

  it('renders with a custom helpFn that receives no arguments', () => {
    const helpFn = jest.fn();
    const { UNSAFE_getByType } = render(<HelpIcon helpFn={helpFn} />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(helpFn).toHaveBeenCalledWith();
  });

  it('renders with default props and does not crash', () => {
    expect(() => render(<HelpIcon />)).not.toThrow();
  });

  it('allows replacing helpFn with a different function', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    const { UNSAFE_getByType, rerender } = render(<HelpIcon helpFn={fn1} />);
    const { TouchableOpacity } = require('react-native');
    rerender(<HelpIcon helpFn={fn2} />);
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn1).not.toHaveBeenCalled();
  });

  it('renders only one TouchableOpacity at the top level', () => {
    const { UNSAFE_getAllByType } = render(<HelpIcon />);
    const { TouchableOpacity } = require('react-native');
    expect(UNSAFE_getAllByType(TouchableOpacity).length).toBe(1);
  });

  it('snapshot matches', () => {
    const { toJSON } = render(<HelpIcon helpFn={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
