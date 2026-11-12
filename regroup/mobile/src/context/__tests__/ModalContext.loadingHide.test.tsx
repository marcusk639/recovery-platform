/**
 * The loading modal hides itself after a finished save, wherever it is hosted.
 *
 * On iOS the app's modals live in the top sheet's ScreenModalHost, so opening or
 * closing a sheet remounts RatsLoadingModal in another host. Its auto-hide used
 * to be internal state only, and the context kept `visible: true` after every
 * success, so a remounted instance showed "success" for good and blocked the
 * app (GuestInvites: success, then goBack()). These cases use the REAL
 * RatsLoadingModal and react-native-modal; ModalContext.hosts.test.tsx mocks both.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ModalProvider, ScreenModalHost, useModal } from '../ModalContext';

let mockIOS = true;
jest.mock('../../util/platform', () => ({
  ...jest.requireActual('../../util/platform'),
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));

jest.mock('../index', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
jest.mock('../../components/rats-loading-indicator/rats-loading-indicator', () => {
  const { View: RNView } = require('react-native');
  return () => <RNView testID="loading-indicator" />;
});
jest.mock('../../components/rats-text', () => {
  const { Text: RNText } = require('react-native');
  return { RatsText: ({ text }: any) => <RNText>{text}</RNText> };
});
jest.mock('../../components/rats-hoc', () => ({ withRats: (C: any) => C }));
jest.mock('../../components/screen-header', () => () => null);
jest.mock('../../components/ios-status-bar', () => () => null);

const Buttons = () => {
  const { showLoadingModal, setLoadingModalState } = useModal();
  return (
    <>
      <Pressable onPress={() => showLoadingModal('Sending...')}>
        <Text>load</Text>
      </Pressable>
      <Pressable onPress={() => setLoadingModalState(false, true, 'Sending...')}>
        <Text>succeed</Text>
      </Pressable>
    </>
  );
};

const App = ({ sheets = [] as string[] }) => (
  <ModalProvider>
    <Buttons />
    {sheets.map(id => (
      <View key={id} testID={id}>
        <ScreenModalHost />
      </View>
    ))}
  </ModalProvider>
);

/** Runs the modal animations and the hide timers, then their promise callbacks. */
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      jest.runAllTimers();
    });
  }
}

beforeEach(() => {
  mockIOS = true;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the loading modal after a finished save', () => {
  it('shows success at the root, then hides itself', async () => {
    const view = render(<App />);
    fireEvent.press(view.getByText('load'));
    await settle();
    fireEvent.press(view.getByText('succeed'));

    expect(view.getByText('success')).toBeTruthy();
    await settle();
    expect(view.queryByText('success')).toBeNull();
  });

  it('does not come back at the root when its sheet closes right after (GuestInvites)', async () => {
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('load'));
    await settle();
    fireEvent.press(view.getByText('succeed'));
    view.rerender(<App />);

    await settle();
    expect(view.queryByText('success')).toBeNull();
  });

  it('does not come back when a sheet opens or closes later', async () => {
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('load'));
    await settle();
    fireEvent.press(view.getByText('succeed'));
    await settle();

    view.rerender(<App />);
    await settle();
    expect(view.queryByText('success')).toBeNull();

    view.rerender(<App sheets={['sheet-b']} />);
    await settle();
    expect(view.queryByText('success')).toBeNull();
  });

  it('shows again for the next save', async () => {
    const view = render(<App />);
    fireEvent.press(view.getByText('load'));
    await settle();
    fireEvent.press(view.getByText('succeed'));
    await settle();

    fireEvent.press(view.getByText('load'));
    await settle();
    expect(view.getByText('Sending...')).toBeTruthy();
  });
});
