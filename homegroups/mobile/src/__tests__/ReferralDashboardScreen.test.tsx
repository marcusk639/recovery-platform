import React from 'react';
import {Alert} from 'react-native';
import renderer, {act} from 'react-test-renderer';
// Resolves to the jest.setup.js mock. The screen must import the same
// package: @react-native-community/clipboard is no longer installed or linked.
import Clipboard from '@react-native-clipboard/clipboard';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useRoute: () => ({
    params: {groupId: 'g1', groupName: 'Test Group'},
    name: 'ReferralDashboard',
  }),
}));

jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: {uid: 'user1'},
}));

const mockDispatch = jest.fn(() => ({unwrap: () => Promise.resolve()}));
jest.mock('../store', () => ({
  useAppSelector: (selector: (state: object) => unknown) => selector({}),
  useAppDispatch: () => mockDispatch,
}));

jest.mock('../store/slices/referralSlice', () => ({
  fetchReferralStats: jest.fn(() => ({type: 'referral/fetchStats'})),
  generateCode: jest.fn(() => ({type: 'referral/generateCode'})),
  selectReferralCode: () => 'HG-TEST42',
  selectReferralStats: () => null,
  selectReferralLoading: () => false,
  selectReferralError: () => null,
}));

jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: () => ({id: 'g1', admins: ['user1']}),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

import ReferralDashboardScreen from '../screens/homegroup/ReferralDashboardScreen';

describe('ReferralDashboardScreen — copy referral code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('writes the code to the clipboard and confirms', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<ReferralDashboardScreen />);
      await Promise.resolve();
    });

    const copyBtn = component!.root.findByProps({testID: 'copy-code-button'});
    act(() => {
      copyBtn.props.onPress();
    });

    expect(Clipboard.setString).toHaveBeenCalledWith('HG-TEST42');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Copied!',
      'Referral code copied to clipboard.',
    );
  });
});
