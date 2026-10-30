import React from 'react';
import { View, StatusBar, Platform, Dimensions, StatusBarProps } from 'react-native';
import { IOS } from '../../util/platform';
import { normalize } from '../../styles/theme';

// here, we add the spacing for iOS
// and pass the rest of the props to React Native's StatusBar

// backgroundColor colours the spacer only: StatusBar dropped its backgroundColor
// (and translucent) props in RN 0.87, under Android edge-to-edge.
const IOSStatusBar = (props: StatusBarProps & { backgroundColor?: string }) => {
  const height = IOS ? Dimensions.get('window').height / 22 : 0;
  const { backgroundColor, ...statusBarProps } = props;

  return (
    <View style={{ height, backgroundColor }}>
      <StatusBar {...statusBarProps} />
    </View>
  );
};

export default IOSStatusBar;
