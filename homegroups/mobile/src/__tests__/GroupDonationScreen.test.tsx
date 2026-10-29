import React from 'react';
import {Alert, AlertButton, EmitterSubscription, Linking} from 'react-native';
import renderer, {act} from 'react-test-renderer';
// Resolves to the jest.setup.js mock. The screen must import the same
// package: @react-native-community/clipboard is no longer installed or linked.
import Clipboard from '@react-native-clipboard/clipboard';

const ZELLE_HANDLE = 'treasurer@example.org';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useRoute: () => ({
    params: {groupId: 'g1', groupName: 'Test Group'},
    name: 'GroupDonation',
  }),
}));

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: object) => unknown) => selector({}),
}));

jest.mock('../store', () => ({
  useAppSelector: (selector: (state: object) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock('../store/slices/authSlice', () => ({
  selectUser: () => null,
  selectUserData: () => null,
}));

jest.mock('../store/slices/groupsSlice', () => ({
  completeDonation: jest.fn(() => ({type: 'groups/completeDonation'})),
  selectGroupById: () => ({
    id: 'g1',
    stripeConnectAccountId: null,
    paymentLinks: {zelle: 'treasurer@example.org'},
  }),
}));

jest.mock('../store/slices/treasurySlice', () => ({
  addExternalDonation: jest.fn(() => ({type: 'treasury/addExternal'})),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

import GroupDonationScreen from '../screens/homegroup/GroupDonationScreen';

describe('GroupDonationScreen — copy Zelle info', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // RN's jest preset returns undefined here; the screen's deep-link effect
    // calls .remove() on the subscription during cleanup.
    jest
      .spyOn(Linking, 'addEventListener')
      .mockReturnValue({remove: jest.fn()} as unknown as EmitterSubscription);
  });

  it('copies the Zelle handle from the "Copy Info" alert button', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<GroupDonationScreen />);
      await Promise.resolve();
    });

    const zelleBtn = component!.root.findByProps({testID: 'zelle-button'});
    await act(async () => {
      await zelleBtn.props.onPress();
    });

    const zelleCall = (Alert.alert as jest.Mock).mock.calls.find(
      ([title]) => title === 'Send via Zelle',
    );
    const buttons: AlertButton[] = zelleCall![2];
    const copyInfo = buttons.find(b => b.text === 'Copy Info');

    await act(async () => {
      await copyInfo!.onPress!();
    });

    expect(Clipboard.setString).toHaveBeenCalledWith(ZELLE_HANDLE);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Copied!',
      'Payment info copied to clipboard',
    );
  });
});
