/**
 * RatsScrollView's contract with its keyboard-aware scroll view.
 *
 * Plan Task 2 pinned it on RN 0.72 (react-native-keyboard-aware-scroll-view).
 * Task 15 moved the wrapper to react-native-keyboard-controller. The first
 * block is library-independent and kept passing unchanged. The second pinned
 * the APSL-only props; its cases now pin their keyboard-controller mapping
 * (docs/build/react-native-0.88-keyboard-audit.md and the Task 15 section of
 * docs/build/react-native-0.88-upgrade.md).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import RatsScrollView from '../index';
import { KEYBOARD_TOOLBAR_SPACE } from '../../rats-keyboard';

function scrollProps(element: React.ReactElement) {
  return render(element).UNSAFE_getByType(ScrollView).props;
}

describe('RatsScrollView: behaviour that survives the library change', () => {
  it('keeps taps on the first press while the keyboard is up, unless overridden', () => {
    expect(
      scrollProps(
        <RatsScrollView>
          <Text>x</Text>
        </RatsScrollView>,
      ).keyboardShouldPersistTaps,
    ).toBe('always');
    expect(
      scrollProps(
        <RatsScrollView keyboardShouldPersistTaps="handled">
          <Text>x</Text>
        </RatsScrollView>,
      ).keyboardShouldPersistTaps,
    ).toBe('handled');
  });

  it('dismisses the keyboard on drag and hides the vertical indicator', () => {
    const props = scrollProps(
      <RatsScrollView>
        <Text>x</Text>
      </RatsScrollView>,
    );
    expect(props.keyboardDismissMode).toBe('on-drag');
    expect(props.showsVerticalScrollIndicator).toBe(false);
  });

  it('passes scrollEnabled through', () => {
    expect(
      scrollProps(
        <RatsScrollView scrollEnabled={false}>
          <Text>x</Text>
        </RatsScrollView>,
      ).scrollEnabled,
    ).toBe(false);
  });

  it('uses the default container style when the caller gives none', () => {
    const style = StyleSheet.flatten(
      scrollProps(
        <RatsScrollView>
          <Text>x</Text>
        </RatsScrollView>,
      ).contentContainerStyle,
    );
    expect(style).toEqual(
      expect.objectContaining({
        flexGrow: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        width: '100%',
      }),
    );
  });

  it("replaces the default container style with the caller's (props spread last; pre-existing)", () => {
    const style = StyleSheet.flatten(
      scrollProps(
        <RatsScrollView contentContainerStyle={{ padding: 10 }}>
          <Text>x</Text>
        </RatsScrollView>,
      ).contentContainerStyle,
    );
    expect(style).toEqual({ padding: 10 });
  });
});

describe('RatsScrollView: the APSL props, mapped onto keyboard-controller (Task 15)', () => {
  function hideListener() {
    const call = (KeyboardEvents.addListener as jest.Mock).mock.calls.find(
      ([event]) => event === 'keyboardWillHide',
    );
    return call?.[1] as (() => void) | undefined;
  }

  it('scrolls back to the top when the keyboard hides (resetScrollToCoords)', () => {
    const view = render(
      <RatsScrollView>
        <Text>x</Text>
      </RatsScrollView>,
    );
    const scroll = view.UNSAFE_getByType(ScrollView).instance as any;
    const onHide = hideListener();
    expect(onHide).toBeDefined();
    onHide!();
    expect(scroll.scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: true });
    // keyboard-controller's own scroll-back is off, so the two do not fight.
    expect(view.UNSAFE_getByType(ScrollView).props.disableScrollOnKeyboardHide).toBe(true);
  });

  it('maps extraScrollHeight onto bottomOffset (APSL extraHeight 75 + extraScrollHeight, plus the iOS toolbar)', () => {
    const props = scrollProps(
      <RatsScrollView extraScrollHeight={40} enableOnAndroid>
        <Text>x</Text>
      </RatsScrollView>,
    );
    expect(props.bottomOffset).toBe(75 + 40 + KEYBOARD_TOOLBAR_SPACE);
    expect(props.enableOnAndroid).toBeUndefined();
  });

  it('keeps the APSL default gap of 75 when the caller gives none', () => {
    expect(
      scrollProps(
        <RatsScrollView>
          <Text>x</Text>
        </RatsScrollView>,
      ).bottomOffset,
    ).toBe(75 + KEYBOARD_TOOLBAR_SPACE);
  });

  it('maps extraHeight onto bottomOffset', () => {
    expect(
      scrollProps(
        <RatsScrollView extraHeight={20}>
          <Text>x</Text>
        </RatsScrollView>,
      ).bottomOffset,
    ).toBe(20 + KEYBOARD_TOOLBAR_SPACE);
  });

  it('lets an explicit bottomOffset win over extraHeight and extraScrollHeight', () => {
    expect(
      scrollProps(
        <RatsScrollView bottomOffset={100} extraHeight={20} extraScrollHeight={40}>
          <Text>x</Text>
        </RatsScrollView>,
      ).bottomOffset,
    ).toBe(100 + KEYBOARD_TOOLBAR_SPACE);
  });

  it('turns keyboard-controller off for enableAutomaticScroll={false}', () => {
    expect(
      scrollProps(
        <RatsScrollView enableAutomaticScroll={false}>
          <Text>x</Text>
        </RatsScrollView>,
      ).enabled,
    ).toBe(false);
    expect(
      scrollProps(
        <RatsScrollView>
          <Text>x</Text>
        </RatsScrollView>,
      ).enabled,
    ).toBe(true);
  });

  it('does not scroll on keyboard hide with enableResetScrollToCoords={false}', () => {
    render(
      <RatsScrollView enableResetScrollToCoords={false}>
        <Text>x</Text>
      </RatsScrollView>,
    );
    expect(hideListener()).toBeUndefined();
  });

  it('hands the ScrollView to innerRef', () => {
    const innerRef = jest.fn();
    const view = render(
      <RatsScrollView innerRef={innerRef}>
        <Text>x</Text>
      </RatsScrollView>,
    );
    expect(innerRef).toHaveBeenCalledWith(view.UNSAFE_getByType(ScrollView).instance);
  });

  it('drops the no-op behavior prop', () => {
    expect(
      scrollProps(
        <RatsScrollView behavior="padding">
          <Text>x</Text>
        </RatsScrollView>,
      ).behavior,
    ).toBeUndefined();
  });
});
