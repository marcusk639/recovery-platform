import React from 'react';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-aware-scroll-view';
import { StyleSheet, Platform } from 'react-native';
import { color } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: color.light_grey,
    width: '100%',
  },
});

interface Props {
  children: any;
  behavior?: any;
}

const RatsScrollView = (
  props: Partial<KeyboardAwareScrollViewProps> & Props,
) => {
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps || 'always'}
      keyboardDismissMode="on-drag"
      resetScrollToCoords={{ x: 0, y: 0 }}
      scrollEnabled={props.scrollEnabled}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.container, props.contentContainerStyle]}
      {...props}>
      {props.children}
    </KeyboardAwareScrollView>
  );
};

export default RatsScrollView;
