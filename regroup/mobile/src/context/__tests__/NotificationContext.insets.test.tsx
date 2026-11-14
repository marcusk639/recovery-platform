/**
 * The app-wide toast is pinned to the bottom of the window, so under Android
 * edge-to-edge (targetSdk 36) it must clear the navigation bar: it is lifted
 * by the bottom safe-area inset.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
// The module object itself: an `import * as` namespace is a copy, which a spy would miss.
const SafeArea = require('react-native-safe-area-context');
import { NotificationProvider, useNotification } from '../NotificationContext';

const Notifier = () => {
  const { notify } = useNotification();
  useEffect(() => {
    notify('Saved', 'Your changes were saved.', [], 'succeed', 0);
  }, [notify]);
  return null;
};

describe('toast bottom inset', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is lifted by the bottom safe-area inset', () => {
    jest
      .spyOn(SafeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: 0, right: 0, bottom: 48, left: 0 });

    render(
      <NotificationProvider>
        <Notifier />
      </NotificationProvider>,
    );

    const toast = screen.getByTestId('notification-toast');
    expect(StyleSheet.flatten(toast.props.style)).toEqual(
      expect.objectContaining({ position: 'absolute', bottom: 10, marginBottom: 48 }),
    );
  });
});
