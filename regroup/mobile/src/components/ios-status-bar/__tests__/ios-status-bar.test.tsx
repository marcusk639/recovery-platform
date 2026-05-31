/**
 * Tests for IOSStatusBar component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

// Mock react-native-iphone-x-helper used by platform util
jest.mock('react-native-iphone-x-helper', () => ({
  isIphoneX: () => false,
  getBottomSpace: () => 0,
}));

import IOSStatusBar from '../index';

describe('IOSStatusBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<IOSStatusBar />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders a StatusBar inside a View', () => {
    const { UNSAFE_getByType, UNSAFE_getAllByType } = render(<IOSStatusBar />);
    const { View, StatusBar } = require('react-native');
    expect(UNSAFE_getByType(View)).toBeTruthy();
    expect(UNSAFE_getAllByType(StatusBar).length).toBeGreaterThan(0);
  });

  it('passes backgroundColor to the wrapper View', () => {
    const { UNSAFE_getByType } = render(
      <IOSStatusBar backgroundColor="red" />,
    );
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const style = view.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flatStyle.backgroundColor).toBe('red');
  });

  it('passes barStyle prop to StatusBar', () => {
    const { UNSAFE_getAllByType } = render(
      <IOSStatusBar barStyle="light-content" />,
    );
    const { StatusBar } = require('react-native');
    const bars = UNSAFE_getAllByType(StatusBar);
    expect(bars[0].props.barStyle).toBe('light-content');
  });

  it('passes hidden prop to StatusBar when hidden=true', () => {
    const { UNSAFE_getAllByType } = render(<IOSStatusBar hidden={true} />);
    const { StatusBar } = require('react-native');
    const bar = UNSAFE_getAllByType(StatusBar)[0];
    expect(bar.props.hidden).toBe(true);
  });

  it('passes hidden=false to StatusBar by default', () => {
    const { UNSAFE_getAllByType } = render(<IOSStatusBar />);
    const { StatusBar } = require('react-native');
    const bar = UNSAFE_getAllByType(StatusBar)[0];
    expect(bar.props.hidden).toBeFalsy();
  });

  it('wrapper View has a numeric height prop from Dimensions', () => {
    // The IOS constant is evaluated at import time; we verify the height is a number
    const { UNSAFE_getByType } = render(<IOSStatusBar />);
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const style = view.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(typeof flatStyle.height).toBe('number');
  });

  it('renders without backgroundColor prop', () => {
    const { toJSON } = render(<IOSStatusBar />);
    expect(toJSON()).toBeTruthy();
  });

  it('passes translucent prop to StatusBar', () => {
    const { UNSAFE_getAllByType } = render(<IOSStatusBar translucent={true} />);
    const { StatusBar } = require('react-native');
    const bar = UNSAFE_getAllByType(StatusBar)[0];
    expect(bar.props.translucent).toBe(true);
  });

  it('renders consistently (snapshot)', () => {
    const { toJSON } = render(
      <IOSStatusBar backgroundColor="#000" barStyle="dark-content" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('accepts animated prop without crashing', () => {
    const { toJSON } = render(<IOSStatusBar animated={true} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts statusBarAnimation prop without crashing', () => {
    const { toJSON } = render(<IOSStatusBar statusBarAnimation="slide" />);
    expect(toJSON()).toBeTruthy();
  });
});
