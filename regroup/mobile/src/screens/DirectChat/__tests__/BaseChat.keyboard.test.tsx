/**
 * BaseChat (the HouseChat tab) after IQKeyboardManager (plan Task 15): the
 * composer rides on a keyboard-controller sticky view instead of a
 * translateY driven by keyboard listeners, and the list is a plain FlatList.
 */
import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import BaseChat from '../BaseChat';
import { KEYBOARD_TOOLBAR_SPACE, RatsKeyboardStickyView } from '../../../components/rats-keyboard';
import { color, normalize } from '../../../styles/theme';

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require('react-native');
    return <Text>{text || ''}</Text>;
  },
}));

jest.mock('../../../components/rats-button/rats-button', () => {
  const { Text } = require('react-native');
  return ({ title }: any) => <Text>{title}</Text>;
});

jest.mock('../../../components/rats-icon', () => {
  const { View } = require('react-native');
  return { RatsIcon: () => <View />, Icon: () => <View /> };
});

jest.mock('../../../components/rats-avatar', () => {
  const { View } = require('react-native');
  return () => <View />;
});

jest.mock('../../../util/display', () => ({ dateAndTime: () => '' }));
jest.mock('../../../util/phone', () => ({ callNumber: jest.fn() }));
jest.mock('uuid', () => ({ v4: () => 'uuid' }));

const TAB_BAR = 83;

function renderTab() {
  const props: any = {
    navigation: { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) },
    user: { uid: 'u1', firstName: 'A', lastName: 'B' },
    house: { id: 'h1' },
    recipient: {},
    messages: [],
    guests: {},
    admins: {},
    selectGuest: jest.fn(),
    onSend: jest.fn(),
    loadMore: jest.fn(),
  };
  return render(
    <BottomTabBarHeightContext.Provider value={TAB_BAR}>
      <BaseChat {...props} />
    </BottomTabBarHeightContext.Provider>,
  );
}

describe('BaseChat composer keyboard', () => {
  it('puts the composer in RatsKeyboardStickyView with its old layout props', () => {
    const view = renderTab();
    let node: any = view.getByPlaceholderText('Type a message').parent;
    while (node && node.type !== RatsKeyboardStickyView) {
      node = node.parent;
    }
    expect(node).toBeTruthy();
    expect(StyleSheet.flatten(node.props.style)).toEqual({
      width: '100%',
      height: normalize(50),
      paddingHorizontal: normalize(10),
      backgroundColor: color.white,
      paddingTop: normalize(5),
      bottom: 0,
      position: 'absolute',
    });
  });

  it('lands the composer on the keyboard (above the iOS toolbar) from its place on the tab bar', () => {
    const sticky = renderTab().UNSAFE_getByType(RatsKeyboardStickyView);
    expect(sticky.props.offset).toEqual({ closed: 0, opened: TAB_BAR - KEYBOARD_TOOLBAR_SPACE });
  });

  it('renders the messages in a plain inverted FlatList that keeps room for the composer', () => {
    const list = renderTab().UNSAFE_getByType(FlatList);
    expect(list.props.inverted).toBe(true);
    expect(list.props.style).toEqual({ marginBottom: normalize(50) });
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
