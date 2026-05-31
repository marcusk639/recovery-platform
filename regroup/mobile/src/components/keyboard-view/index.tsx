import React from 'react';
import {
  TouchableOpacityProps,
  TouchableOpacity,
  Keyboard,
} from 'react-native';

const KeyboardView = (props: Partial<TouchableOpacityProps>) => {
  return (
    <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} {...props} />
  );
};

export default KeyboardView;
