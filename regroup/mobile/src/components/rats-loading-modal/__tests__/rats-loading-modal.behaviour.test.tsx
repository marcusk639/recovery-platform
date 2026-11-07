/**
 * RatsLoadingModal behaviour with the REAL react-native-modal (no library mock).
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2): written on
 * RN 0.72, kept passing on 0.88 with the patched react-native-modal. The
 * existing rats-loading-modal.test.tsx mocks the library; this file pins the
 * show -> success -> auto-hide sequence through the real one.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import RatsLoadingModal from '../index';

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('../../rats-loading-indicator/rats-loading-indicator', () => {
  const { View } = require('react-native');
  return () => <View testID="loading-indicator" />;
});

jest.mock('../../rats-text', () => {
  const { Text } = require('react-native');
  return { RatsText: ({ text }: any) => <Text>{text}</Text> };
});

jest.mock('../../rats-hoc', () => ({ withRats: (C: any) => C }));

const props = { loadingMessage: 'Saving...', success: false, error: '' };

/** Runs the modal animations and timers to the end, then their promise callbacks. */
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      jest.runAllTimers();
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('RatsLoadingModal with react-native-modal', () => {
  it('shows the loading state, then success, then hides itself', async () => {
    const screen = render(<RatsLoadingModal {...props} isVisible={false} loading={false} />);
    expect(screen.queryByText('Saving...')).toBeNull();

    screen.rerender(<RatsLoadingModal {...props} isVisible loading />);
    await settle();
    expect(screen.getByText('Saving...')).toBeTruthy();
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();

    screen.rerender(<RatsLoadingModal {...props} isVisible loading={false} success />);
    expect(screen.getByText('success')).toBeTruthy();

    await settle();
    expect(screen.queryByText('success')).toBeNull();
  });

  it('shows the error message instead of success', async () => {
    const screen = render(<RatsLoadingModal {...props} isVisible loading />);
    await settle();

    screen.rerender(
      <RatsLoadingModal {...props} isVisible loading={false} error="Could not save" />,
    );

    expect(screen.getByText('Could not save')).toBeTruthy();
    expect(screen.queryByText('success')).toBeNull();
  });

  it('unmounts while visible without throwing', async () => {
    const screen = render(<RatsLoadingModal {...props} isVisible loading />);
    await settle();

    expect(() => {
      screen.unmount();
      jest.runAllTimers();
    }).not.toThrow();
  });
});
