import React, { Fragment } from 'react';
import { TouchableWithoutFeedback, View } from 'react-native';
import { RatsText } from '../rats-text';
import {
  selectedTabStyle,
  baseTabStyle,
  selectedTextStyle,
  baseTextStyle,
} from './styles';
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { tabBarStyle } from '../../styles/theme';
import { NavBarProps } from '../nav-bar';

export interface TabProps {
  title: string;
  route: string;
  currentRoute: string;
}

const Tab = (props: {
  title: string;
  route: string;
  currentRoute: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) => {
  const textStyle =
    props.route === props.currentRoute ? selectedTextStyle : baseTextStyle;
  const tabStyle =
    props.route === props.currentRoute ? selectedTabStyle : baseTabStyle;
  return (
    <Fragment>
      <TouchableWithoutFeedback
        onPress={() => props.navigation.navigate(props.route)}>
        <View style={tabStyle}>
          <RatsText translate={false} text={props.title} style={textStyle} />
        </View>
      </TouchableWithoutFeedback>
    </Fragment>
  );
};

export interface TabBarProps extends NativeStackScreenProps<any> {
  children: JSX.Element[];
  navBar?: (props: NavBarProps) => JSX.Element;
}

const TabBar = (props: TabBarProps) => {
  // If still using router flux, do not use Actions.currentScene here to get the current scene.
  // It gives you the key of the previous scene
  return (
    <View style={{ height: '15%' }}>
      {props.navBar &&
        props.navBar({
          ...props,
          containerStyle: { height: '50%' },
          title: '',
          navTitle: '',
          drawer: true,
          guest: {} as any, // Cast to any as a temporary solution
        })}
      <View style={tabBarStyle}>{props.children}</View>
    </View>
  );
};

export { Tab, TabBar };
