/**
 * RatsScrollView's contract with its keyboard-aware scroll view, as found on
 * RN 0.72 (react-native-keyboard-aware-scroll-view, plan Task 2).
 *
 * Task 15 moves the wrapper to react-native-keyboard-controller. The first
 * block is library-independent and must keep passing. The second pins the
 * APSL-only props (resetScrollToCoords, extraScrollHeight pass-through), which
 * have no keyboard-controller equivalent; Task 15 replaces those cases with the
 * mapping recorded in docs/build/react-native-0.88-upgrade.md.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import RatsScrollView from '../index';

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

describe('RatsScrollView: APSL props on RN 0.72 (replaced in Task 15)', () => {
  it('scrolls back to the top when the keyboard hides (resetScrollToCoords)', () => {
    expect(
      scrollProps(
        <RatsScrollView>
          <Text>x</Text>
        </RatsScrollView>,
      ).resetScrollToCoords,
    ).toEqual({ x: 0, y: 0 });
  });

  it('passes extraScrollHeight and enableOnAndroid through to the library', () => {
    const props = scrollProps(
      <RatsScrollView {...({ extraScrollHeight: 40, enableOnAndroid: true } as any)}>
        <Text>x</Text>
      </RatsScrollView>,
    );
    expect(props.extraScrollHeight).toBe(40);
    expect(props.enableOnAndroid).toBe(true);
  });
});
