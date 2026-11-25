/**
 * The resident profile's Balance edit (rent spec §4.6, launch plan Task 25). It
 * reuses GuestUpdateForm's money fields over the real updateGuest transaction:
 * the save carries the figure the form showed, so a rent charge that lands while
 * the form is open is caught, said, and only overwritten once the manager
 * confirms. Peer leaders can't open it, and nobody edits their own balance.
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () =>
  require('../../../../__mocks__/firebase-modular/auth'),
);
jest.mock('../../../util/logging', () => ({ logException: jest.fn(), logDebug: jest.fn() }));

const mockGuest: { current: any } = { current: null };
jest.mock('../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest: mockGuest.current, guestId: mockGuest.current?.id }),
}));
let mockMayEdit = true;
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: () => mockMayEdit,
}));
jest.mock('../../../components/screen-header', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ header }: { header: string }) => React.createElement(Text, null, header);
});

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readDoc, resetOpLog, seedDoc } from '../../../../__mocks__/firebase-modular/log';
import { setCurrentUser } from '../../../../__mocks__/firebase-modular/auth';
import GuestBalanceScreen from '../GuestBalanceScreen';

const RESIDENT = {
  id: 'g1',
  userId: 'resident-uid',
  houseId: 'h1',
  firstName: 'Pat',
  lastName: 'Q',
  rentOwed: 50000,
  choreFees: 0,
  version: 1,
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GuestBalanceScreen navigation={navigation} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  resetOpLog();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockMayEdit = true;
  mockGuest.current = { ...RESIDENT };
  seedDoc('guests/g1', { ...RESIDENT });
  setCurrentUser({ uid: 'manager-uid' });
});

describe('GuestBalanceScreen', () => {
  it('shows only the balance fields, in dollars, to a manager', () => {
    const view = renderScreen();
    expect(view.getByTestId('guest-rentowed-input').props.value).toBe('500');
    expect(view.getByTestId('guest-chorefees-input')).toBeTruthy();
    expect(view.queryByTestId('guest-firstname-input')).toBeNull();
  });

  it('saves a corrected balance in cents and goes back', async () => {
    const view = renderScreen();
    fireEvent.changeText(view.getByTestId('guest-rentowed-input'), '400');
    fireEvent.press(view.getByTestId('create-guest-button'));
    await waitFor(() => expect(readDoc('guests/g1')?.rentOwed).toBe(40000));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('a charge lands while it is open: saving says the balance changed, and confirming saves the typed figure', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = renderScreen();
    fireEvent.changeText(view.getByTestId('guest-rentowed-input'), '400');
    // The hourly job adds $175.00 of rent meanwhile.
    seedDoc('guests/g1', { ...RESIDENT, rentOwed: 67500 });

    fireEvent.press(view.getByTestId('create-guest-button'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('The balance changed');
    expect(alert.mock.calls[0][1]).toBe(
      'Rent owed is now $675.00, probably from a payment or a rent charge. Save $400.00 anyway?',
    );
    expect(readDoc('guests/g1')?.rentOwed).toBe(67500);

    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => {
      buttons.find((b) => b.text === 'Save $400.00')!.onPress!();
    });
    await waitFor(() => expect(readDoc('guests/g1')?.rentOwed).toBe(40000));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('a peer leader cannot open it', () => {
    mockMayEdit = false;
    const view = renderScreen();
    expect(view.getByTestId('guest-balance-not-allowed')).toBeTruthy();
    expect(view.queryByTestId('guest-rentowed-input')).toBeNull();
  });

  it('nobody can edit their own balance, a manager included', () => {
    setCurrentUser({ uid: 'resident-uid' });
    const view = renderScreen();
    expect(view.getByTestId('guest-balance-not-allowed')).toBeTruthy();
    expect(view.queryByTestId('guest-rentowed-input')).toBeNull();
  });
});
