/**
 * Android Back while the keyboard is up in the discharge dialog: the first
 * Back closes only the keyboard (Android 16 predictive back, targetSdk 36,
 * can hand it to the dialog first). See rats-modal.android-back.test.tsx.
 */
import React from 'react';
import { Modal } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import DischargeGuestModal from '../DischargeGuestModal';

jest.mock('../../../services/guest');

jest.mock('../../../util/platform', () => ({
  ...jest.requireActual('../../../util/platform'),
  IOS: false,
  ANDROID: true,
}));

const isVisible = KeyboardController.isVisible as jest.Mock;
const dismiss = KeyboardController.dismiss as jest.Mock;

function renderDialog(onClose: jest.Mock) {
  return render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={onClose}
      onSuccess={jest.fn()}
    />,
  );
}

beforeEach(() => {
  isVisible.mockReturnValue(false);
  dismiss.mockClear();
});

it('closes only the keyboard on Back while it is up', () => {
  isVisible.mockReturnValue(true);
  const onClose = jest.fn();
  const screen = renderDialog(onClose);

  act(() => {
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
  });

  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

it('closes the dialog on Back with the keyboard down', () => {
  const onClose = jest.fn();
  const screen = renderDialog(onClose);

  act(() => {
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dismiss).not.toHaveBeenCalled();
});
