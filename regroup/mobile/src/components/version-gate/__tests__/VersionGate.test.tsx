// The minimum-version gate (launch plan P5 Task 13, Review Focus 4): it must
// never block everyone. A slow, failing or missing getAppConfig, a missing or
// malformed value, and a value for the other platform all let the user in.
// Only a minimum strictly above this build's version blocks.
import React from 'react';
import { AppState, Linking, Platform, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '../../../state/__tests__/test-utils';
import { functions } from '../../../../firebase-setup';
import VersionGate from '../VersionGate';
import { APP_VERSION } from '../../../config/appVersion';
import { STORE_LINKS } from '../../../config/storeLinks';

const mockCall = jest.fn();
const appStateListeners: Array<(state: string) => void> = [];

beforeEach(() => {
  jest.useFakeTimers();
  mockCall.mockReset();
  appStateListeners.length = 0;
  (functions.httpsCallable as jest.Mock).mockReset().mockReturnValue(mockCall);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: any) => {
    appStateListeners.push(fn);
    return { remove: jest.fn() };
  }) as any);
  Platform.OS = 'ios';
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const gate = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <VersionGate>
      <Text testID="app-content">app</Text>
    </VersionGate>
  </QueryClientProvider>
);

let client: QueryClient;
const renderGate = () => {
  client = createTestQueryClient();
  return render(gate(client));
};

const settle = async () => {
  // React Query notifies on a timer; a few ms, well inside the 3 s timeout.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20);
  });
};

const config = (minVersion: unknown) => Promise.resolve({ data: { minVersion } });

describe('VersionGate blocks', () => {
  it('when the minimum for this platform is above this build', async () => {
    mockCall.mockReturnValue(config({ ios: '99.0', android: null }));
    const screen = renderGate();
    await settle();
    expect(functions.httpsCallable).toHaveBeenCalledWith('getAppConfig');
    expect(screen.getByTestId('update-required-screen')).toBeTruthy();
    expect(screen.queryByTestId('app-content')).toBeNull();
  });

  it('on Android, by the Android value', async () => {
    Platform.OS = 'android';
    mockCall.mockReturnValue(config({ ios: null, android: '99.0' }));
    const screen = renderGate();
    await settle();
    expect(screen.getByTestId('update-required-screen')).toBeTruthy();
  });

  it("and the store button opens this platform's store listing", async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    mockCall.mockReturnValue(config({ ios: '99.0' }));
    const screen = renderGate();
    await settle();
    fireEvent.press(screen.getByTestId('update-required-store-button'));
    expect(open).toHaveBeenCalledWith(STORE_LINKS.ios);
  });
});

describe('VersionGate lets the user in', () => {
  const allows = async (setup: () => void) => {
    setup();
    const screen = renderGate();
    await settle();
    expect(screen.getByTestId('app-content')).toBeTruthy();
    expect(screen.queryByTestId('update-required-screen')).toBeNull();
  };

  it('when the minimum equals this build', () =>
    allows(() => mockCall.mockReturnValue(config({ ios: APP_VERSION.ios }))));

  it('when the minimum is below this build', () =>
    allows(() => mockCall.mockReturnValue(config({ ios: '0.1' }))));

  it('when the callable rejects', () =>
    allows(() => mockCall.mockReturnValue(Promise.reject(new Error('unavailable')))));

  it('when the callable returns null values', () =>
    allows(() => mockCall.mockReturnValue(config({ ios: null, android: null }))));

  it('when the callable returns no minVersion at all', () =>
    allows(() => mockCall.mockReturnValue(Promise.resolve({ data: null }))));

  it('when the value is malformed', () =>
    allows(() => mockCall.mockReturnValue(config({ ios: 'latest' }))));

  it('when minVersion is not a map', () => allows(() => mockCall.mockReturnValue(config('99.0'))));

  it('when only the other platform has a minimum', () =>
    allows(() => mockCall.mockReturnValue(config({ android: '99.0' }))));

  it('while the call is still pending', () =>
    allows(() => mockCall.mockReturnValue(new Promise(() => {}))));

  it('when the callable answers only after the 3 s timeout', async () => {
    let answer: (value: unknown) => void = () => {};
    mockCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const screen = renderGate();
    await act(async () => {
      jest.advanceTimersByTime(3001);
    });
    await act(async () => {
      answer({ data: { minVersion: { ios: '99.0' } } });
    });
    await settle();
    expect(screen.getByTestId('app-content')).toBeTruthy();
    expect(screen.queryByTestId('update-required-screen')).toBeNull();
  });
});

describe('VersionGate refreshes', () => {
  it('when the app returns to the foreground, and lets the user back in once lowered', async () => {
    mockCall.mockReturnValue(config({ ios: '99.0' }));
    const screen = renderGate();
    await settle();
    expect(screen.getByTestId('update-required-screen')).toBeTruthy();

    mockCall.mockReturnValue(config({ ios: null }));
    await act(async () => {
      appStateListeners.forEach((fn) => fn('background'));
      appStateListeners.forEach((fn) => fn('active'));
    });
    await settle();
    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('app-content')).toBeTruthy();
  });

  it('only once per launch while the app stays in the foreground', async () => {
    mockCall.mockReturnValue(config({ ios: null }));
    const screen = renderGate();
    await settle();
    screen.rerender(gate(client));
    await settle();
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});
