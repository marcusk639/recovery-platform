/**
 * Tests for rats-hoc Higher-Order Components:
 * withRats, withNotifier, withPopover, withLoadingModal, withStatUpdateModal
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Text, View, TouchableOpacity } from 'react-native';

import { withRats } from '../withRats';
import { withNotifier } from '../withNotifier';
import { withPopover } from '../withPopover';
import { withLoadingModal } from '../withLoadingModal';
import { withStatUpdateModal } from '../withStatUpdateModal';

// ─── withRats ────────────────────────────────────────────────────────────────

describe('withRats', () => {
  interface BaseProps {
    t?: (key: string) => string;
    theme?: any;
    label: string;
  }

  const Base = ({ t, theme, label }: BaseProps) => (
    <View>
      <Text testID="t-result">{t ? t('hello') : 'no-t'}</Text>
      <Text testID="theme-color">{theme ? theme.primaryColor : 'no-theme'}</Text>
      <Text testID="label">{label}</Text>
    </View>
  );

  const Wrapped = withRats(Base);

  it('renders without crashing', () => {
    const { toJSON } = render(<Wrapped label="test" />);
    expect(toJSON()).toBeTruthy();
  });

  it('injects t function that returns the translation key', () => {
    const { getByTestId } = render(<Wrapped label="hi" />);
    expect(getByTestId('t-result').props.children).toBe('hello');
  });

  it('injects theme with primaryColor', () => {
    const { getByTestId } = render(<Wrapped label="hi" />);
    expect(getByTestId('theme-color').props.children).toBeTruthy();
  });

  it('passes through own props', () => {
    const { getByTestId } = render(<Wrapped label="my-label" />);
    expect(getByTestId('label').props.children).toBe('my-label');
  });

  it('sets displayName correctly', () => {
    expect(Wrapped.displayName).toBe('withRats(Base)');
  });

  it('uses Component as fallback display name for anonymous components', () => {
    const Anon = withRats(({ t }: any) => <Text>{t('x')}</Text>);
    expect(Anon.displayName).toBe('withRats(Component)');
  });

  it('does not crash when label changes (re-render)', () => {
    const { getByTestId, rerender } = render(<Wrapped label="first" />);
    rerender(<Wrapped label="second" />);
    expect(getByTestId('label').props.children).toBe('second');
  });
});

// ─── withNotifier ─────────────────────────────────────────────────────────────

describe('withNotifier', () => {
  interface BaseProps {
    showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
    hideNotification: () => void;
    extraProp?: string;
  }

  const Base = ({ showNotification, hideNotification, extraProp }: BaseProps) => (
    <View>
      <TouchableOpacity testID="show-btn" onPress={() => showNotification('hello')} />
      <TouchableOpacity testID="hide-btn" onPress={() => hideNotification()} />
      <Text testID="extra">{extraProp ?? 'none'}</Text>
    </View>
  );

  const Wrapped = withNotifier(Base);

  it('renders without crashing', () => {
    const { toJSON } = render(<Wrapped />);
    expect(toJSON()).toBeTruthy();
  });

  it('passes showNotification and hideNotification as props', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(getByTestId('show-btn')).toBeTruthy();
    expect(getByTestId('hide-btn')).toBeTruthy();
  });

  it('does not throw when showNotification is called', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(() => fireEvent.press(getByTestId('show-btn'))).not.toThrow();
  });

  it('does not throw when hideNotification is called', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(() => fireEvent.press(getByTestId('hide-btn'))).not.toThrow();
  });

  it('passes through extra own props', () => {
    const { getByTestId } = render(<Wrapped extraProp="hello" />);
    expect(getByTestId('extra').props.children).toBe('hello');
  });

  it('sets displayName correctly', () => {
    expect(Wrapped.displayName).toBe('withNotifier(Base)');
  });

  it('accepts type parameter in showNotification', () => {
    const Base2 = ({ showNotification }: BaseProps) => (
      <TouchableOpacity
        testID="btn"
        onPress={() => showNotification('test', 'error')}
      />
    );
    const W = withNotifier(Base2);
    const { getByTestId } = render(<W />);
    expect(() => fireEvent.press(getByTestId('btn'))).not.toThrow();
  });
});

// ─── withPopover ──────────────────────────────────────────────────────────────

describe('withPopover', () => {
  interface BaseProps {
    showPopover: (content: React.ReactNode, position?: { x: number; y: number }) => void;
    hidePopover: () => void;
    isPopoverVisible: boolean;
  }

  const Base = ({ showPopover, hidePopover, isPopoverVisible }: BaseProps) => (
    <View>
      <TouchableOpacity testID="show-btn" onPress={() => showPopover(<Text>content</Text>)} />
      <TouchableOpacity testID="hide-btn" onPress={() => hidePopover()} />
      <Text testID="visible">{String(isPopoverVisible)}</Text>
    </View>
  );

  const Wrapped = withPopover(Base);

  it('renders without crashing', () => {
    const { toJSON } = render(<Wrapped />);
    expect(toJSON()).toBeTruthy();
  });

  it('isPopoverVisible starts as false', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('isPopoverVisible becomes true after showPopover', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(getByTestId('visible').props.children).toBe('true');
  });

  it('isPopoverVisible becomes false again after hidePopover', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    act(() => { fireEvent.press(getByTestId('hide-btn')); });
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('sets displayName correctly', () => {
    expect(Wrapped.displayName).toBe('withPopover(Base)');
  });

  it('accepts position parameter in showPopover without crashing', () => {
    const Base2 = ({ showPopover }: BaseProps) => (
      <TouchableOpacity
        testID="btn"
        onPress={() => showPopover(<Text />, { x: 10, y: 20 })}
      />
    );
    const W = withPopover(Base2);
    const { getByTestId } = render(<W />);
    expect(() => act(() => { fireEvent.press(getByTestId('btn')); })).not.toThrow();
  });
});

// ─── withLoadingModal ─────────────────────────────────────────────────────────

describe('withLoadingModal', () => {
  interface BaseProps {
    showLoadingModal: (message?: string) => void;
    hideLoadingModal: () => void;
    setLoadingSuccess: () => void;
    setLoadingError: (error: string) => void;
    isLoadingModalVisible: boolean;
  }

  const Base = ({
    showLoadingModal,
    hideLoadingModal,
    setLoadingSuccess,
    setLoadingError,
    isLoadingModalVisible,
  }: BaseProps) => (
    <View>
      <TouchableOpacity testID="show-btn" onPress={() => showLoadingModal('Loading...')} />
      <TouchableOpacity testID="hide-btn" onPress={() => hideLoadingModal()} />
      <TouchableOpacity testID="success-btn" onPress={() => setLoadingSuccess()} />
      <TouchableOpacity testID="error-btn" onPress={() => setLoadingError('Oops')} />
      <Text testID="visible">{String(isLoadingModalVisible)}</Text>
    </View>
  );

  const Wrapped = withLoadingModal(Base);

  it('renders without crashing', () => {
    const { toJSON } = render(<Wrapped />);
    expect(toJSON()).toBeTruthy();
  });

  it('isLoadingModalVisible starts as false', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('isLoadingModalVisible becomes true after showLoadingModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(getByTestId('visible').props.children).toBe('true');
  });

  it('isLoadingModalVisible becomes false after hideLoadingModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    act(() => { fireEvent.press(getByTestId('hide-btn')); });
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('does not throw when setLoadingSuccess is called', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(() => act(() => { fireEvent.press(getByTestId('success-btn')); })).not.toThrow();
  });

  it('does not throw when setLoadingError is called', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(() => act(() => { fireEvent.press(getByTestId('error-btn')); })).not.toThrow();
  });

  it('sets displayName correctly', () => {
    expect(Wrapped.displayName).toBe('withLoadingModal(Base)');
  });
});

// ─── withStatUpdateModal ──────────────────────────────────────────────────────

describe('withStatUpdateModal', () => {
  interface BaseProps {
    showStatUpdateModal: (statType: string, currentValue?: number) => void;
    hideStatUpdateModal: () => void;
    isStatUpdateModalVisible: boolean;
    statModalType: string | null;
  }

  const Base = ({
    showStatUpdateModal,
    hideStatUpdateModal,
    isStatUpdateModalVisible,
    statModalType,
  }: BaseProps) => (
    <View>
      <TouchableOpacity
        testID="show-btn"
        onPress={() => showStatUpdateModal('meeting', 5)}
      />
      <TouchableOpacity testID="hide-btn" onPress={() => hideStatUpdateModal()} />
      <Text testID="visible">{String(isStatUpdateModalVisible)}</Text>
      <Text testID="type">{statModalType ?? 'null'}</Text>
    </View>
  );

  const Wrapped = withStatUpdateModal(Base);

  it('renders without crashing', () => {
    const { toJSON } = render(<Wrapped />);
    expect(toJSON()).toBeTruthy();
  });

  it('isStatUpdateModalVisible starts as false', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('statModalType starts as null', () => {
    const { getByTestId } = render(<Wrapped />);
    expect(getByTestId('type').props.children).toBe('null');
  });

  it('isStatUpdateModalVisible becomes true after showStatUpdateModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(getByTestId('visible').props.children).toBe('true');
  });

  it('statModalType is set correctly after showStatUpdateModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    expect(getByTestId('type').props.children).toBe('meeting');
  });

  it('isStatUpdateModalVisible becomes false after hideStatUpdateModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    act(() => { fireEvent.press(getByTestId('hide-btn')); });
    expect(getByTestId('visible').props.children).toBe('false');
  });

  it('statModalType resets to null after hideStatUpdateModal', () => {
    const { getByTestId } = render(<Wrapped />);
    act(() => { fireEvent.press(getByTestId('show-btn')); });
    act(() => { fireEvent.press(getByTestId('hide-btn')); });
    expect(getByTestId('type').props.children).toBe('null');
  });

  it('sets displayName correctly', () => {
    expect(Wrapped.displayName).toBe('withStatUpdateModal(Base)');
  });
});
