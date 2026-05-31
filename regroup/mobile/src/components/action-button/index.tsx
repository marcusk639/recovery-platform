import {
  TouchableOpacity,
  TouchableOpacityProps,
  TextStyle,
  View,
} from 'react-native';
import { RatsIcon } from '../rats-icon/rats-icon';
import { fontSize, normalize, ROW, fontFamily } from '../../styles/theme';
import { RatsText } from '../rats-text';
import React from 'react';

interface ActionButtonProps extends Partial<TouchableOpacityProps> {
  iconName: string;
  iconStyle?: TextStyle;
  textStyle?: TextStyle;
  text?: string;
  description?: string;
  descriptionStyle?: TextStyle;
  onPress: () => void;
  iconSize?: number;
  touchableRef?: any;
}

export const ActionButton = (props: ActionButtonProps) => {
  return (
    <TouchableOpacity
      ref={props.touchableRef}
      style={[
        ROW,
        { alignItems: 'center', padding: normalize(10) },
        props.style,
      ]}
      onPress={props.onPress}>
      <View style={[ROW]}>
        <RatsIcon
          name={props.iconName}
          size={props.iconSize || fontSize.regular}
          style={[{ marginRight: normalize(5) }, props.iconStyle || {}]}
        />
        {props.text && (
          <RatsText
            text={props.text}
            style={[{ fontFamily: fontFamily.roboto }, props.textStyle]}
          />
        )}
      </View>
      {props.description && (
        <RatsText
          text={props.description}
          style={[{ fontFamily: fontFamily.roboto }, props.descriptionStyle]}
        />
      )}
    </TouchableOpacity>
  );
};
