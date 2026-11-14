/**
 * The keyboard layer (plan Task 15): the app-root toolbar on iOS only, the
 * sticky view and the avoiding view's toolbar allowance.
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

type RatsKeyboard = typeof import('../index');
type Controller = typeof import('react-native-keyboard-controller');

/** Loads rats-keyboard as it is on the given platform (IOS is read at load). */
function load(os: 'ios' | 'android'): { rk: RatsKeyboard; kc: Controller } {
  let rk!: RatsKeyboard;
  let kc!: Controller;
  jest.isolateModules(() => {
    jest.doMock('../../../util/platform', () => ({
      IOS: os === 'ios',
      ANDROID: os === 'android',
    }));
    rk = require('../index');
    kc = require('react-native-keyboard-controller');
  });
  return { rk, kc };
}

describe('RatsKeyboardProvider', () => {
  it('wraps the app in KeyboardProvider and adds the toolbar on iOS', () => {
    const { rk, kc } = load('ios');
    const view = render(
      <rk.RatsKeyboardProvider>
        <Text>app</Text>
      </rk.RatsKeyboardProvider>,
    );
    expect(view.getByText('app')).toBeTruthy();
    expect(view.UNSAFE_getAllByType(kc.KeyboardToolbar)).toHaveLength(1);
    expect(view.toJSON()).toEqual(expect.objectContaining({ type: 'KeyboardProvider' }));
  });

  it('adds no toolbar on Android', () => {
    const { rk, kc } = load('android');
    const view = render(
      <rk.RatsKeyboardProvider>
        <Text>app</Text>
      </rk.RatsKeyboardProvider>,
    );
    expect(view.getByText('app')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(kc.KeyboardToolbar)).toHaveLength(0);
  });
});

describe('RatsKeyboardToolbar', () => {
  it('shows Prev/Next and Done on iOS, like IQKeyboardManager', () => {
    const { rk, kc } = load('ios');
    const toolbar = render(<rk.RatsKeyboardToolbar />).UNSAFE_getByType(kc.KeyboardToolbar);
    expect(toolbar.props.showArrows).toBe(true);
    expect(toolbar.props.doneText).toBe('Done');
  });

  it('renders nothing on Android', () => {
    const { rk } = load('android');
    expect(render(<rk.RatsKeyboardToolbar />).toJSON()).toBeNull();
  });
});

describe('KEYBOARD_TOOLBAR_SPACE', () => {
  it("is the toolbar's 42pt on iOS and 0 on Android", () => {
    expect(load('ios').rk.KEYBOARD_TOOLBAR_SPACE).toBe(42);
    expect(load('android').rk.KEYBOARD_TOOLBAR_SPACE).toBe(0);
  });
});

describe('RatsKeyboardStickyView', () => {
  it("passes its layout props and offset to keyboard-controller's KeyboardStickyView", () => {
    const { rk, kc } = load('ios');
    const style = { position: 'absolute' as const, bottom: 0, height: 50 };
    const sticky = render(
      <rk.RatsKeyboardStickyView style={style} offset={{ closed: 0, opened: 30 }}>
        <Text>composer</Text>
      </rk.RatsKeyboardStickyView>,
    ).UNSAFE_getByType(kc.KeyboardStickyView);
    expect(sticky.props.style).toEqual(style);
    expect(sticky.props.offset).toEqual({ closed: 0, opened: 30 });
  });
});

describe('RatsKeyboardAvoidingView', () => {
  it('adds the toolbar height to the vertical offset on iOS', () => {
    const { rk, kc } = load('ios');
    const kav = render(
      <rk.RatsKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={5}>
        <Text>form</Text>
      </rk.RatsKeyboardAvoidingView>,
    ).UNSAFE_getByType(kc.KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    // Added, not subtracted: keyboard-controller's padding is
    // frameBottom - (screenHeight - keyboardHeight - keyboardVerticalOffset).
    expect(kav.props.keyboardVerticalOffset).toBe(5 + 42);
  });

  it('leaves the offset alone on Android', () => {
    const { rk, kc } = load('android');
    const kav = render(
      <rk.RatsKeyboardAvoidingView behavior="padding">
        <Text>form</Text>
      </rk.RatsKeyboardAvoidingView>,
    ).UNSAFE_getByType(kc.KeyboardAvoidingView);
    expect(kav.props.keyboardVerticalOffset).toBe(0);
  });
});

describe('RatsAndroidResizeView', () => {
  it('pads for the keyboard on Android, as adjustResize did', () => {
    const { rk, kc } = load('android');
    const kav = render(
      <rk.RatsAndroidResizeView>
        <Text>screen</Text>
      </rk.RatsAndroidResizeView>,
    ).UNSAFE_getByType(kc.KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.props.enabled).toBe(true);
  });

  it('does nothing on iOS, where IQKeyboardManager left pinned footers alone', () => {
    const { rk, kc } = load('ios');
    const kav = render(
      <rk.RatsAndroidResizeView>
        <Text>screen</Text>
      </rk.RatsAndroidResizeView>,
    ).UNSAFE_getByType(kc.KeyboardAvoidingView);
    expect(kav.props.enabled).toBe(false);
  });
});

describe('useRatsKeyboardHeight', () => {
  it('is 0 while the keyboard is hidden and its height while shown', () => {
    const { rk, kc } = load('ios');
    const Probe = () => <Text>{String(rk.useRatsKeyboardHeight())}</Text>;
    (kc.useKeyboardState as jest.Mock).mockImplementation((select: any) =>
      select({ isVisible: false, height: 300 }),
    );
    expect(render(<Probe />).getByText('0')).toBeTruthy();
    (kc.useKeyboardState as jest.Mock).mockImplementation((select: any) =>
      select({ isVisible: true, height: 300 }),
    );
    expect(render(<Probe />).getByText('300')).toBeTruthy();
  });
});

describe('RatsKeyboardScreenLayout (native-stack modal routes)', () => {
  it('renders the screen and its own toolbar on iOS', () => {
    const { rk, kc } = load('ios');
    const view = render(
      <rk.RatsKeyboardScreenLayout>
        <Text>modal screen</Text>
      </rk.RatsKeyboardScreenLayout>,
    );
    expect(view.getByText('modal screen')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(kc.KeyboardToolbar)).toHaveLength(1);
  });

  it('renders just the screen on Android', () => {
    const { rk, kc } = load('android');
    const view = render(
      <rk.RatsKeyboardScreenLayout>
        <Text>modal screen</Text>
      </rk.RatsKeyboardScreenLayout>,
    );
    expect(view.getByText('modal screen')).toBeTruthy();
    expect(view.UNSAFE_queryAllByType(kc.KeyboardToolbar)).toHaveLength(0);
  });
});
