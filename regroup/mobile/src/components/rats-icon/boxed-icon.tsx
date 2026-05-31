import React from 'react';
import { View, TouchableOpacity, ViewStyle } from 'react-native';
import {
  normalize,
  elevateStyle,
  color,
  fontSize,
  fontFamily,
} from '../../styles/theme';
import { RatsIcon } from './rats-icon';
import { RatsText } from '../rats-text';

interface BoxedIconProps {
  name: string;
  backgroundColor: string;
  text?: string | number | null;
  container?: ViewStyle | null;
  onPress?: (() => void) | null;
  iconSize?: number | null;
  iconColor?: string | null;
}

const BoxedIcon = ({
  name,
  backgroundColor,
  text = null,
  container = null,
  onPress = null,
  iconSize = null,
  iconColor = null,
}: BoxedIconProps) => {
  return (
    <TouchableOpacity
      onPress={onPress ?? undefined}
      activeOpacity={onPress ? 0.2 : 1.0}
      style={[
        {
          ...elevateStyle,
          borderRadius: 5,
          height: normalize(45),
          width: normalize(45),
          backgroundColor: backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
          padding: normalize(5),
        },
        container,
      ]}>
      {(text === null || text === undefined) && (
        <RatsIcon
          name={name}
          solid
          size={iconSize || normalize(22)}
          style={{ color: iconColor || color.white }}
        />
      )}
      {text !== null && text !== undefined && (
        <RatsText
          text={text}
          translate={false}
          style={{
            fontSize: fontSize.extraLarge,
            color: color.white,
            fontFamily: fontFamily.timesNewRoman,
          }}
        />
      )}
    </TouchableOpacity>
  );
};

export default BoxedIcon;
