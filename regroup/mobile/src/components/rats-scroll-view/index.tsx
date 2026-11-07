import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollViewProps, StyleSheet } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewRef,
  KeyboardEvents,
} from 'react-native-keyboard-controller';
import { color } from '../../styles/theme';
import { IQ_KEYBOARD_DISTANCE, KEYBOARD_TOOLBAR_SPACE } from '../rats-keyboard';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: color.light_grey,
    width: '100%',
  },
});

// react-native-keyboard-aware-scroll-view's defaults, which set the gap every
// existing caller was tuned to: the focused field stopped
// extraHeight + extraScrollHeight above the keyboard.
const APSL_EXTRA_HEIGHT = 75;
const APSL_EXTRA_SCROLL_HEIGHT = 0;

export interface RatsScrollViewProps extends ScrollViewProps {
  children?: React.ReactNode;
  /** Gap between the focused field and the keyboard. Wins over the two below. */
  bottomOffset?: number;
  /** Former APSL prop: part of the gap (default 75). */
  extraHeight?: number;
  /** Former APSL prop: part of the gap (default 0). */
  extraScrollHeight?: number;
  /** false: do not scroll the focused field into view. */
  enableAutomaticScroll?: boolean;
  /** Scroll to `resetScrollToCoords` when the keyboard hides (default true). */
  enableResetScrollToCoords?: boolean;
  resetScrollToCoords?: { x: number; y: number };
  /** keyboard-controller's scroll back on keyboard hide (off by default here). */
  disableScrollOnKeyboardHide?: boolean;
  /** Former APSL prop. keyboard-controller handles Android always. */
  enableOnAndroid?: boolean;
  /** Receives the underlying ScrollView. */
  innerRef?: (ref: KeyboardAwareScrollViewRef | null) => void;
  /** No effect (it never had one). */
  behavior?: unknown;
}

/**
 * For a screen that was a plain React Native ScrollView, where only
 * IQKeyboardManager (iOS) and adjustResize (Android) kept the focused field
 * visible: React Native's own scroll defaults in place of RatsScrollView's,
 * IQKeyboardManager's 10pt gap, and its scroll back when the keyboard hides.
 * Spread it first so the screen's own props win.
 */
export const IQ_SCROLL_VIEW_PROPS = {
  bottomOffset: IQ_KEYBOARD_DISTANCE,
  keyboardShouldPersistTaps: 'never',
  keyboardDismissMode: 'none',
  showsVerticalScrollIndicator: true,
  enableResetScrollToCoords: false,
  disableScrollOnKeyboardHide: false,
} as const;

const RatsScrollView = (props: RatsScrollViewProps) => {
  const {
    children,
    bottomOffset,
    extraHeight = APSL_EXTRA_HEIGHT,
    extraScrollHeight = APSL_EXTRA_SCROLL_HEIGHT,
    enableAutomaticScroll = true,
    enableResetScrollToCoords = true,
    resetScrollToCoords = { x: 0, y: 0 },
    // Dropped: keyboard-controller works on Android always, and behavior
    // never did anything.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    enableOnAndroid: _enableOnAndroid,
    innerRef,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    behavior: _behavior,
    ...scrollProps
  } = props;
  const scrollRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const setRef = useCallback(
    (ref: KeyboardAwareScrollViewRef | null) => {
      scrollRef.current = ref;
      innerRef?.(ref);
    },
    [innerRef],
  );

  const { x, y } = resetScrollToCoords;
  useEffect(() => {
    if (!enableResetScrollToCoords) {
      return undefined;
    }
    const subscription = KeyboardEvents.addListener('keyboardWillHide', () => {
      scrollRef.current?.scrollTo({ x, y, animated: true });
    });
    return () => subscription.remove();
  }, [enableResetScrollToCoords, x, y]);

  const gap = bottomOffset ?? extraHeight + extraScrollHeight;

  return (
    <KeyboardAwareScrollView
      ref={setRef}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'always'}
      keyboardDismissMode="on-drag"
      scrollEnabled={props.scrollEnabled}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.container, props.contentContainerStyle]}
      bottomOffset={gap + KEYBOARD_TOOLBAR_SPACE}
      enabled={enableAutomaticScroll}
      // The reset above replaces keyboard-controller's own scroll-back.
      disableScrollOnKeyboardHide
      {...scrollProps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
};

export default RatsScrollView;
