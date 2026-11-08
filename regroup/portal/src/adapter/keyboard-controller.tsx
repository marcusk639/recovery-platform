// react-native-keyboard-controller has no web build, and a desk has no on-screen keyboard.
import { forwardRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native-web';

export { KeyboardAvoidingView } from 'react-native-web';

export const KEYBOARD_HAS_ROUNDED_CORNERS = false;
export const KeyboardProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const KeyboardStickyView = View;
export const KeyboardToolbar = () => null;

export const KeyboardAwareScrollView = forwardRef<unknown, any>(
  ({ bottomOffset: _bottomOffset, disableScrollOnKeyboardHide: _disable, extraKeyboardSpace: _extra, ...props }, ref) => (
    <ScrollView ref={ref} {...props} />
  ),
);

export const useKeyboardState = <T,>(selector: (state: { isVisible: boolean; height: number }) => T): T =>
  selector({ isVisible: false, height: 0 });

export const KeyboardEvents = {
  addListener: (_event: string, _listener: () => void) => ({ remove: () => {} }),
};
