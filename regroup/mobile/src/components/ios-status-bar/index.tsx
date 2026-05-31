import React from 'react';
import { View, StatusBar, Platform, Dimensions, StatusBarProps } from 'react-native';
import { IOS } from '../../util/platform';
import { normalize } from '../../styles/theme';

// here, we add the spacing for iOS
// and pass the rest of the props to React Native's StatusBar

const IOSStatusBar = (props: StatusBarProps & { backgroundColor?: string }) => {
  const height = IOS ? Dimensions.get('window').height / 22 : 0;
  const { backgroundColor } = props;

  return (
    <View style={{ height, backgroundColor }}>
      <StatusBar {...props} />
    </View>
  );
};

export default IOSStatusBar;
