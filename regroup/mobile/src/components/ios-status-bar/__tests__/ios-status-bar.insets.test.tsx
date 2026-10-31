/**
 * IOSStatusBar under Android edge-to-edge (targetSdk 36): the status bar is
 * transparent there too, so the spacer reserves the top safe-area inset on
 * Android. iOS keeps its existing spacer height.
 */
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';
// The module object itself: an `import * as` namespace is a copy, which a spy would miss.
const SafeArea = require('react-native-safe-area-context');

let mockIOS = false;
jest.mock('../../../util/platform', () => ({
  get IOS() {
    return mockIOS;
  },
}));

import IOSStatusBar from '../index';

const spacerHeight = (ui: ReturnType<typeof render>) =>
  StyleSheet.flatten(ui.UNSAFE_getAllByType(View)[0].props.style).height;

describe('IOSStatusBar spacer height', () => {
  beforeEach(() => {
    jest
      .spyOn(SafeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: 24, right: 0, bottom: 48, left: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reserves the top inset on Android', () => {
    mockIOS = false;

    expect(spacerHeight(render(<IOSStatusBar />))).toBe(24);
  });

  it('keeps the iOS height, independent of the inset', () => {
    mockIOS = true;

    expect(spacerHeight(render(<IOSStatusBar />))).toBe(Dimensions.get('window').height / 22);
  });
});
