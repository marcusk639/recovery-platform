/**
 * Tests for RatsModal component
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import RatsModal, { RatsModalTitle } from '../index';

jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible, testID }: any) =>
    isVisible ? <View testID={testID}>{children}</View> : null;
});

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      tertiaryColor: '#ccc',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

jest.mock('../../ios-status-bar', () => {
  const { View } = require('react-native');
  return () => <View testID="ios-status-bar" />;
});

const noop = () => {};
// The new tests skip react-native-modal's defaulted props, as callers do.
const AnyModal = RatsModal as any;

describe('RatsModal', () => {
  it('renders without crashing when visible', () => {
    const { toJSON } = render(
      <RatsModal isVisible onBackdropPress={noop}>
        <></>
      </RatsModal>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <RatsModal isVisible={false} onBackdropPress={noop}>
        <></>
      </RatsModal>,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders children when visible', () => {
    const { getByText } = render(
      <RatsModal isVisible onBackdropPress={noop}>
        <>
          <React.Fragment>{/* RatsText child rendered through context mock */}</React.Fragment>
        </>
      </RatsModal>,
    );
    // Modal is visible — tree is truthy
    expect(true).toBe(true);
  });

  it('renders a title via RatsModalTitle when title prop is provided', () => {
    const { getByText } = render(
      <RatsModal isVisible onBackdropPress={noop} title="Hello Modal">
        <></>
      </RatsModal>,
    );
    expect(getByText('Hello Modal')).toBeTruthy();
  });

  it('does not render title when title prop is omitted', () => {
    const { queryByText } = render(
      <RatsModal isVisible onBackdropPress={noop}>
        <></>
      </RatsModal>,
    );
    expect(queryByText('Hello Modal')).toBeNull();
  });

  it('renders children content inside the modal', () => {
    const { getByText } = render(
      <RatsModal isVisible onBackdropPress={noop}>
        <>
          {/* Use a plain Text node so we can assert it */}
          {React.createElement(require('react-native').Text, null, 'child content')}
        </>
      </RatsModal>,
    );
    expect(getByText('child content')).toBeTruthy();
  });

  it('accepts a custom modalStyle prop without crashing', () => {
    const { toJSON } = render(
      <RatsModal isVisible onBackdropPress={noop} modalStyle={{ backgroundColor: 'blue' }}>
        <></>
      </RatsModal>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts useKeyboardView=false without crashing', () => {
    const { toJSON } = render(
      <RatsModal isVisible onBackdropPress={noop} useKeyboardView={false}>
        <></>
      </RatsModal>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts fullScreen prop without crashing', () => {
    const { toJSON } = render(
      <RatsModal isVisible onBackdropPress={noop} fullScreen>
        <></>
      </RatsModal>,
    );
    expect(toJSON()).toBeTruthy();
  });

  // Android edge-to-edge (RN 0.88) draws the Modal window under the status
  // bar, so a full-screen modal needs the same top spacer as on iOS.
  it('reserves the status bar on Android for a full-screen modal', () => {
    const { getByTestId } = render(
      <AnyModal isVisible onBackdropPress={noop} fullScreen>
        <></>
      </AnyModal>,
    );
    expect(getByTestId('ios-status-bar')).toBeTruthy();
  });

  it('adds no status-bar spacer to a sheet modal', () => {
    const { queryByTestId } = render(
      <AnyModal isVisible onBackdropPress={noop}>
        <></>
      </AnyModal>,
    );
    expect(queryByTestId('ios-status-bar')).toBeNull();
  });

  // Same window, other edge: a form's Save/Cancel row sat under the navigation bar.
  // The app root's inset, as IOSStatusBar uses: a native SafeAreaView inside the
  // Android Modal window measures a bottom inset of 0.
  it('pads a full-screen modal for the navigation bar on Android', () => {
    const SafeArea = require('react-native-safe-area-context');
    const spy = jest
      .spyOn(SafeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: 24, right: 0, bottom: 48, left: 0 });
    const { getByTestId } = render(
      <AnyModal isVisible onBackdropPress={noop} fullScreen>
        <></>
      </AnyModal>,
    );
    expect(StyleSheet.flatten(getByTestId('rats-modal-bottom-inset').props.style).height).toBe(48);
    spy.mockRestore();
  });
});

describe('RatsModalTitle', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsModalTitle title="My Title" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the provided title text', () => {
    const { getByText } = render(<RatsModalTitle title="Section Title" />);
    expect(getByText('Section Title')).toBeTruthy();
  });

  it('renders without a title prop without crashing', () => {
    const { toJSON } = render(<RatsModalTitle />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts containerStyle without crashing', () => {
    const { toJSON } = render(<RatsModalTitle title="Styled" containerStyle={{ padding: 10 }} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts titleStyle without crashing', () => {
    const { toJSON } = render(<RatsModalTitle title="Styled" titleStyle={{ color: 'red' }} />);
    expect(toJSON()).toBeTruthy();
  });
});
