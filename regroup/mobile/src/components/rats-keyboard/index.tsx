/**
 * The app's keyboard layer, on react-native-keyboard-controller.
 *
 * This module, `rats-scroll-view` and `index.js` are the only importers of
 * react-native-keyboard-controller (ESLint enforces it). It replaces
 * IQKeyboardManager (iOS) and Android's `adjustResize`, which edge-to-edge
 * (targetSdk 36) no longer applies. The per-screen mapping is in
 * docs/build/react-native-0.88-keyboard-audit.md.
 */
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  KEYBOARD_HAS_ROUNDED_CORNERS,
  KeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  KeyboardProvider,
  KeyboardStickyView,
  KeyboardStickyViewProps,
  KeyboardToolbar,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { IOS } from '../../util/platform';

/**
 * IQKeyboardManager's default `keyboardDistanceFromTextField`: the gap it kept
 * between a focused field and the keyboard (plus its toolbar) on every screen
 * no other wrapper handled.
 */
export const IQ_KEYBOARD_DISTANCE = 10;

// keyboard-controller's KEYBOARD_TOOLBAR_HEIGHT (not exported) and the extra
// lift its toolbar takes over keyboards with rounded corners (OPENED_OFFSET).
const TOOLBAR_HEIGHT = 42;
const ROUNDED_CORNER_LIFT = 11;

/**
 * Height the iOS toolbar adds on top of the keyboard. IQKeyboardManager's
 * toolbar was the field's input accessory view, so the keyboard frame
 * included it; keyboard-controller's is a separate view, so the scroll and
 * avoiding views add it back to keep the same visible gap. 0 on Android.
 */
export const KEYBOARD_TOOLBAR_SPACE = IOS
  ? TOOLBAR_HEIGHT + (KEYBOARD_HAS_ROUNDED_CORNERS ? ROUNDED_CORNER_LIFT : 0)
  : 0;

/**
 * Prev / Next / Done above the keyboard, as IQKeyboardManager drew on iOS. It
 * is the only way to dismiss the numeric, decimal and phone pads. It is a JS
 * view positioned absolutely in its parent, so a native `Modal` covers the
 * root one: every native-Modal surface renders its own.
 */
export const RatsKeyboardToolbar = () => {
  if (!IOS) {
    return null;
  }
  return <KeyboardToolbar doneText="Done" showArrows />;
};

interface ProviderProps {
  children: React.ReactNode;
}

/**
 * Navigator `screenLayout` for the root stack's modal group. On iOS a
 * native-stack modal route is presented above the app root, so the root
 * toolbar is hidden under it: each modal screen renders its own.
 */
export const RatsKeyboardScreenLayout = ({ children }: ProviderProps) => (
  <>
    {children}
    <RatsKeyboardToolbar />
  </>
);

/** The keyboard-controller provider, with the app-root toolbar. */
export const RatsKeyboardProvider = ({ children }: ProviderProps) => (
  <KeyboardProvider>
    {children}
    <RatsKeyboardToolbar />
  </KeyboardProvider>
);

/** A view that follows the keyboard (the chat composers). */
export const RatsKeyboardStickyView = (props: KeyboardStickyViewProps) => (
  <KeyboardStickyView {...props} />
);

/**
 * keyboard-controller's KeyboardAvoidingView. On iOS it also clears the
 * toolbar, which sits above the keyboard and is not in its height: the
 * library's padding grows with keyboardVerticalOffset, so the toolbar is added.
 */
export const RatsKeyboardAvoidingView = ({
  keyboardVerticalOffset = 0,
  ...props
}: KeyboardAvoidingViewProps) => (
  <KeyboardAvoidingView
    {...props}
    keyboardVerticalOffset={keyboardVerticalOffset + KEYBOARD_TOOLBAR_SPACE}
  />
);

/** The keyboard's height while it is open, else 0. Re-renders on change. */
export const useRatsKeyboardHeight = (): number =>
  useKeyboardState((state) => (state.isVisible ? state.height : 0));

interface ResizeProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * What Android's adjustResize did for a screen with a footer pinned below its
 * scroll view: on Android the area shrinks to end at the keyboard, so the
 * footer stays above it. iOS is unchanged (IQKeyboardManager left these
 * footers under the keyboard). Not for content already inside a RatsModal,
 * whose avoiding view does this on both platforms.
 */
export const RatsAndroidResizeView = ({ children, style }: ResizeProps) => (
  <RatsKeyboardAvoidingView
    behavior="padding"
    enabled={!IOS}
    style={[{ flex: 1 }, style]}>
    {children}
  </RatsKeyboardAvoidingView>
);
