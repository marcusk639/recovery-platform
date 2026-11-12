import React from 'react';
import { View, StatusBar, Platform, Dimensions, StatusBarProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IOS } from '../../util/platform';
import { normalize } from '../../styles/theme';

// The app-wide top spacer: iOS keeps its fixed height; Android reserves the
// top inset, since edge-to-edge (targetSdk 36) makes its status bar
// transparent. The rest of the props go to React Native's StatusBar.

// backgroundColor colours the spacer only: StatusBar dropped its backgroundColor
// (and translucent) props in RN 0.87, under Android edge-to-edge.
const IOSStatusBar = (props: StatusBarProps & { backgroundColor?: string }) => {
  const insets = useSafeAreaInsets();
  const height = IOS ? Dimensions.get('window').height / 22 : insets.top;
  const { backgroundColor, ...statusBarProps } = props;

  return (
    <View style={{ height, backgroundColor }}>
      <StatusBar {...statusBarProps} />
    </View>
  );
};

export default IOSStatusBar;
