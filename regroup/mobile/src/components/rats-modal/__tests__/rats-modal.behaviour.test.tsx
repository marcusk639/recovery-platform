/**
 * RatsModal behaviour with the REAL react-native-modal (no library mock).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2): written on
 * RN 0.72, kept passing on 0.88 with the patched react-native-modal (its
 * InteractionManager calls removed). rats-modal.test.tsx mocks the library and
 * covers rendering; this file covers what users do with a modal: dismiss by
 * backdrop or hardware back, show/hide callbacks, swipe props, unmount.
 * The swipe gesture itself is the library's; the Mac checkpoint exercises it.
 */
import React from 'react';
import { BackHandler, Text, TouchableWithoutFeedback } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ReactNativeModal from 'react-native-modal';
import RatsModalComponent from '../index';

// RatsModal's props type requires every react-native-modal prop (a baseline
// typing issue, see rats-modal.test.tsx); callers pass a few.
const RatsModal = RatsModalComponent as unknown as React.ComponentType<any>;

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#000', textColor: '#000', primaryFontFamily: 'System' },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../ios-status-bar', () => {
  const { View } = require('react-native');
  return () => <View testID="ios-status-bar" />;
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Runs the open/close animations to the end, then their promise callbacks. */
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      jest.runAllTimers();
    });
  }
}

describe('RatsModal with react-native-modal', () => {
  it('calls onBackdropPress when the backdrop is pressed', async () => {
    const onBackdropPress = jest.fn();
    const screen = render(
      <RatsModal isVisible onBackdropPress={onBackdropPress}>
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();

    fireEvent.press(screen.UNSAFE_getAllByType(TouchableWithoutFeedback)[0]);

    expect(onBackdropPress).toHaveBeenCalledTimes(1);
  });

  it('calls onBackButtonPress on hardware back while visible', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const onBackButtonPress = jest.fn();
    render(
      <RatsModal isVisible onBackdropPress={jest.fn()} onBackButtonPress={onBackButtonPress}>
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();

    const handler = addListener.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
    expect(handler).toBeDefined();
    let handled: boolean | null | undefined;
    act(() => {
      handled = handler!();
    });

    expect(onBackButtonPress).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
    addListener.mockRestore();
  });

  it('fires onModalShow on open and onModalHide on close', async () => {
    const onModalShow = jest.fn();
    const onModalHide = jest.fn();
    const screen = render(
      <RatsModal
        isVisible={false}
        onBackdropPress={jest.fn()}
        onModalShow={onModalShow}
        onModalHide={onModalHide}
      >
        <Text>body</Text>
      </RatsModal>,
    );

    screen.rerender(
      <RatsModal
        isVisible
        onBackdropPress={jest.fn()}
        onModalShow={onModalShow}
        onModalHide={onModalHide}
      >
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();
    expect(onModalShow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('body')).toBeTruthy();

    screen.rerender(
      <RatsModal
        isVisible={false}
        onBackdropPress={jest.fn()}
        onModalShow={onModalShow}
        onModalHide={onModalHide}
      >
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();
    expect(onModalHide).toHaveBeenCalledTimes(1);
  });

  it('passes swipe dismissal through to the library, with the JS driver', async () => {
    const onSwipeComplete = jest.fn();
    const screen = render(
      <RatsModal
        isVisible
        onBackdropPress={jest.fn()}
        swipeDirection="down"
        onSwipeComplete={onSwipeComplete}
      >
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();

    const modal = screen.UNSAFE_getByType(ReactNativeModal as unknown as React.ComponentType<any>);
    expect(modal.props.swipeDirection).toBe('down');
    expect(modal.props.onSwipeComplete).toBe(onSwipeComplete);
    expect(modal.props.useNativeDriver).toBe(false);
  });

  it('unmounts while visible without throwing', async () => {
    const screen = render(
      <RatsModal isVisible onBackdropPress={jest.fn()}>
        <Text>body</Text>
      </RatsModal>,
    );
    await settle();

    expect(() => {
      screen.unmount();
      jest.runAllTimers();
    }).not.toThrow();
  });
});
