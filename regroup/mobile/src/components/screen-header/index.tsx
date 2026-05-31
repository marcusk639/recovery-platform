import React, { PropsWithChildren } from 'react';
import {
  CARD_STYLE,
  normalize,
  fontSize,
  ROW,
  color,
  fontFamily,
  elevateStyle,
} from '../../styles/theme';
import { View, ViewStyle, TouchableOpacity, TextStyle } from 'react-native';
import { RatsText } from '../rats-text';
import { RatsIcon } from '../rats-icon/rats-icon';
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from '@react-navigation/native';
import {
  HouseSelectionButton,
  GuestSelectionButton,
} from '../title-bar-right-button';
import { Routes } from '../../navigation/types';

interface Props {
  header: string;
  icon?: JSX.Element;
  container?: ViewStyle;
  renderBackButton?: boolean;
  renderHouseButton?: boolean;
  renderGuestButton?: boolean;
  clickableHouseButton?: boolean;
  headerStyle?: TextStyle;
  onBackPress?: () => void;
  selectHouse?: () => void;
  selectGuest?: () => void;
}

const ScreenHeader = (props: PropsWithChildren<Props>) => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { headerStyle = {}, onBackPress, clickableHouseButton } = props;

  const navigateToHouseList = () => {
    if (clickableHouseButton) {
      navigation.navigate(Routes.HouseList);
    }
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  const navigateToGuestList = () => {
    navigation.navigate(Routes.GuestList);
  };

  const renderHeader = () => (
    <RatsText
      text={props.header}
      style={{
        ...headerStyle,
        fontSize: fontSize.large,
        fontFamily: fontFamily.bold,
      }}
    />
  );

  const shouldRenderBackButton = () => {
    return props.renderBackButton && navigation.canGoBack();
  };

  return (
    <View
      style={[
        CARD_STYLE,
        {
          height: normalize(60),
          justifyContent: 'center',
          marginBottom: 2,
          paddingHorizontal: normalize(15),
        },
        props.container,
      ]}>
      <View
        style={[
          ROW,
          { justifyContent: 'space-between', alignItems: 'center' },
        ]}>
        <View style={[ROW, { alignItems: 'center' }]}>
          {props.renderHouseButton && (
            <TouchableOpacity
              testID="house-switcher-button"
              activeOpacity={clickableHouseButton ? 0.2 : 1.0}
              onPress={navigateToHouseList}
              style={[ROW, { alignItems: 'center' }]}>
              <HouseSelectionButton />
              <View>
                {renderHeader()}
                {clickableHouseButton && (
                  <RatsText
                    text="Change home"
                    style={{ fontSize: fontSize.small, color: color.baby_blue }}
                  />
                )}
              </View>
            </TouchableOpacity>
          )}
          {shouldRenderBackButton() && (
            <TouchableOpacity testID="back-button" onPress={handleBackPress}>
              <RatsIcon
                solid
                name="arrow-left"
                size={normalize(25)}
                style={{ color: color.baby_blue, marginRight: normalize(15) }}
              />
            </TouchableOpacity>
          )}
          {props.renderGuestButton && (
            <TouchableOpacity
              onPress={navigateToGuestList}
              style={[ROW, { alignItems: 'center' }]}>
              <GuestSelectionButton />
              <View>
                {renderHeader()}
                <RatsText
                  text="Change guest"
                  style={{ fontSize: fontSize.small, color: color.baby_blue }}
                />
              </View>
            </TouchableOpacity>
          )}
          {!props.renderHouseButton &&
            !props.renderGuestButton &&
            renderHeader()}
        </View>
        {props.icon}
        {props.children}
      </View>
    </View>
  );
};

export default ScreenHeader;
