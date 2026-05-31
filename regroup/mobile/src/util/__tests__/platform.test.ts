// src/util/__tests__/platform.test.ts
//
// Unit tests for platform.ts.
// Exports tested:
//   - isLandscape() → boolean (uses Dimensions.get('screen'))
//   - tabBarHeight() → number (depends on Platform.OS and Platform.Version)
//
// IOS / ANDROID / IS_X / bottomSpace are module-level constants evaluated once
// at import time so they cannot be trivially re-tested per-case without
// isolateModules. We test the testable function exports instead.
//
// react-native-iphone-x-helper is a real JS package included in transformIgnorePatterns.

import { Dimensions, Platform } from 'react-native';

// isLandscape and tabBarHeight reference Platform values at call time, so
// we can control them via Object.defineProperty.

describe('isLandscape', () => {
  afterEach(() => {
    // No persistent side effects to clean up.
  });

  it('returns true when screen width is greater than height (landscape)', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 812,
      height: 375,
      scale: 1,
      fontScale: 1,
    });

    const { isLandscape } = require('../platform');
    expect(isLandscape()).toBe(true);
  });

  it('returns false when screen height is greater than width (portrait)', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 375,
      height: 812,
      scale: 1,
      fontScale: 1,
    });

    const { isLandscape } = require('../platform');
    expect(isLandscape()).toBe(false);
  });

  it('returns true when width equals height (square screen, treated as landscape)', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 500,
      height: 500,
      scale: 1,
      fontScale: 1,
    });

    const { isLandscape } = require('../platform');
    expect(isLandscape()).toBe(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe('tabBarHeight', () => {
  afterEach(() => jest.restoreAllMocks());

  function setOS(os: 'ios' | 'android') {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }

  function setVersion(version: string | number) {
    Object.defineProperty(Platform, 'Version', {
      value: version,
      configurable: true,
    });
  }

  it('returns 49 on iOS 11+ in portrait orientation', () => {
    setOS('ios');
    setVersion('11.0');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 375,
      height: 812,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(49);
  });

  it('returns 49 on iOS 14 in portrait orientation', () => {
    setOS('ios');
    setVersion('14');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(49);
  });

  it('returns 29 on iOS 11+ in landscape orientation', () => {
    setOS('ios');
    setVersion('11');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 812,
      height: 375,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(29);
  });

  it('returns 29 on iOS below version 11', () => {
    setOS('ios');
    setVersion('10');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 375,
      height: 667,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(29);
  });

  it('returns 29 on Android (not iOS)', () => {
    setOS('android');
    setVersion('28');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 360,
      height: 720,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(29);
  });

  it('returns 29 on Android regardless of orientation', () => {
    setOS('android');
    setVersion('30');
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 900,
      height: 400,
      scale: 1,
      fontScale: 1,
    });

    const { tabBarHeight } = require('../platform');
    expect(tabBarHeight()).toBe(29);
  });
});
