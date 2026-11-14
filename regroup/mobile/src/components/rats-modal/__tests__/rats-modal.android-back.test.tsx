/**
 * Android Back while the keyboard is up inside a RatsModal.
 *
 * Since targetSdk 36, Android 16's predictive back can hand Back to the modal's
 * window before the keyboard, so one press closed the modal and lost what was
 * typed. The first Back now only closes the keyboard; the next one closes the
 * modal, as on API 34.
 */
import React from 'react';
import { BackHandler, Modal, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import RatsModalComponent from '../index';

const RatsModal = RatsModalComponent as unknown as React.ComponentType<any>;

jest.mock('../../../util/platform', () => ({
  ...jest.requireActual('../../../util/platform'),
  IOS: false,
  ANDROID: true,
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#000', textColor: '#000', primaryFontFamily: 'System' },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../ios-status-bar', () => {
  const { View } = require('react-native');
  return () => <View testID="ios-status-bar" />;
});

const isVisible = KeyboardController.isVisible as jest.Mock;
const dismiss = KeyboardController.dismiss as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  isVisible.mockReturnValue(false);
  dismiss.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      jest.runAllTimers();
    });
  }
}

async function renderOpenModal(onBackButtonPress: jest.Mock) {
  const screen = render(
    <RatsModal isVisible onBackdropPress={jest.fn()} onBackButtonPress={onBackButtonPress}>
      <Text>form</Text>
    </RatsModal>,
  );
  await settle();
  return screen;
}

describe('RatsModal: Android Back with the keyboard up', () => {
  it('closes only the keyboard when the modal window gets Back', async () => {
    isVisible.mockReturnValue(true);
    const onBackButtonPress = jest.fn();
    const screen = await renderOpenModal(onBackButtonPress);

    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onBackButtonPress).not.toHaveBeenCalled();
  });

  it('closes only the keyboard on a hardware back press', async () => {
    isVisible.mockReturnValue(true);
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const onBackButtonPress = jest.fn();
    await renderOpenModal(onBackButtonPress);

    const handler = addListener.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
    act(() => {
      handler!({ type: 'hardwareBackPress', timeStamp: 0 });
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onBackButtonPress).not.toHaveBeenCalled();
    addListener.mockRestore();
  });

  it('closes the modal when the keyboard is down', async () => {
    const onBackButtonPress = jest.fn();
    const screen = await renderOpenModal(onBackButtonPress);

    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });

    expect(onBackButtonPress).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
