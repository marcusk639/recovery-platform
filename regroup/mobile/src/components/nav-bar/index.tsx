import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { ReactNode } from 'react';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import {
  TouchableWithoutFeedback,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {
  barStyle,
  normalize,
  color,
  fontSize,
  fontFamily,
} from '../../styles/theme';
import { RatsText } from '../rats-text';
import { camelCaseToDisplayForm } from '../../util/display';
import { Guest } from '../../entities/Guest';
import { connect } from 'react-redux';
import { DrawerActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type NavBarProps =
  | { children: ReactNode } & NativeStackScreenProps<any> & {
        title: string;
        navTitle: string;
        containerStyle: ViewStyle;
        drawer: boolean;
        guest: Guest;
      };
const NavBar = (props: NavBarProps) => {
  const { drawer = true } = props;
  const iconStyle: TextStyle = {
    color: color.white,
    paddingLeft: normalize(10),
    paddingRight: normalize(20),
  };
  const titleStyle: TextStyle = {
    fontSize: fontSize.large,
    color: color.white,
    fontFamily: fontFamily.bold,
  };
  const route =
    props.navigation.getState().routes[props.navigation.getState().index];
  // there is a problem getting the title of the current tab in router flux on the initial load. For some reason, initially, there is a route
  // nested within the tab with the correct params on it. This finds those params and gets the title if necessary.
  let title =
    props.navTitle ||
    props.title ||
    props.navigation.getState().routeNames[props.navigation.getState().index] ||
    route.key ||
    'Regroup';
  return (
    <View style={[barStyle, props.containerStyle]}>
      {drawer && (
        <TouchableWithoutFeedback
          onPress={() => props.navigation.dispatch(DrawerActions.openDrawer())}>
          <FontAwesome5 style={iconStyle} name="bars" size={normalize(20)} />
        </TouchableWithoutFeedback>
      )}
      <RatsText
        translate={false}
        text={camelCaseToDisplayForm(title)}
        style={{ ...titleStyle, marginLeft: drawer ? null : normalize(20) }}
      />
      <View style={{ marginLeft: 'auto' }}>{props.children}</View>
    </View>
  );
};

function mapStateToProps(state: any) {
  return {
    navTitle: state.customNavigationState.title,
  };
}

export default connect(mapStateToProps, null)(NavBar);
