import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DischargeGuestModal from '../DischargeGuestModal';
import * as guestService from '../../../services/guest';
import { KeyboardToolbar } from 'react-native-keyboard-controller';
import { RatsKeyboardAvoidingView } from '../../../components/rats-keyboard';

jest.mock('../../../services/guest');

let mockIOS = true;
jest.mock('../../../util/platform', () => ({
  ...jest.requireActual('../../../util/platform'),
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));
const mockedDischarge = guestService.dischargeGuest as jest.MockedFunction<
  typeof guestService.dischargeGuest
>;

const mockOnClose = jest.fn();
const mockOnSuccess = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedDischarge.mockResolvedValue(undefined);
});

it('renders guest name in the confirmation prompt', () => {
  const { getByText } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  expect(getByText(/Jane Smith/)).toBeTruthy();
});

it('calls dischargeGuest with guestId and selected date on confirm', async () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() =>
    expect(mockedDischarge).toHaveBeenCalledWith(
      'guest-1',
      expect.any(String),
      undefined,
    ),
  );
  expect(mockOnSuccess).toHaveBeenCalled();
});

it('calls onClose when Cancel pressed', () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('cancel-discharge-button'));
  expect(mockOnClose).toHaveBeenCalled();
});

it('passes typed notes to dischargeGuest', async () => {
  const { getByTestId, getByPlaceholderText } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.changeText(
    getByPlaceholderText('Notes (optional)'),
    'discharge note',
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() =>
    expect(mockedDischarge).toHaveBeenCalledWith(
      'guest-1',
      expect.any(String),
      'discharge note',
    ),
  );
});

it('does not call onSuccess when dischargeGuest fails', async () => {
  mockedDischarge.mockRejectedValue(new Error('Firestore error'));
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() => expect(mockedDischarge).toHaveBeenCalled());
  expect(mockOnSuccess).not.toHaveBeenCalled();
});

describe('what a failed discharge says (#221)', () => {
  const { Alert } = require('react-native');
  const pressConfirm = () => {
    const { getByTestId } = render(
      <DischargeGuestModal
        visible
        guestId="guest-1"
        guestName="Jane Smith"
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );
    fireEvent.press(getByTestId('confirm-discharge-button'));
  };

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockOnSuccess.mockClear();
  });

  it('says why when the discharge is refused, and does not report success', async () => {
    const message = "You can't discharge this resident. A manager or the owner can.";
    mockedDischarge.mockRejectedValue(Object.assign(new Error(message), { kind: 'refused' }));
    pressConfirm();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Can't discharge", message));
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('reports the discharge when only revoking access failed', async () => {
    const message =
      'Resident was discharged, but house access could not be revoked. Please contact support.';
    mockedDischarge.mockRejectedValue(
      Object.assign(new Error(message), { kind: 'access-not-revoked' }),
    );
    pressConfirm();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Resident discharged', message));
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('still asks for a retry when the failure may be passing', async () => {
    mockedDischarge.mockRejectedValue(new Error('unavailable'));
    pressConfirm();
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Discharge Failed',
        'Could not discharge resident. Please try again.',
      ),
    );
  });
});

describe('keyboard (Task 15)', () => {
  afterEach(() => {
    mockIOS = true;
  });

  const renderModal = () =>
    render(
      <DischargeGuestModal
        visible
        guestId="guest-1"
        guestName="Jane Smith"
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

  it('renders the keyboard toolbar inside the modal on iOS', () => {
    expect(renderModal().UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(1);
  });

  it('renders no keyboard toolbar on Android', () => {
    mockIOS = false;
    expect(renderModal().UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(0);
  });

  it('keeps the notes field inside a padding avoiding view', () => {
    const kav = renderModal().UNSAFE_getByType(RatsKeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.findByProps({ placeholder: 'Notes (optional)' })).toBeTruthy();
  });
});
