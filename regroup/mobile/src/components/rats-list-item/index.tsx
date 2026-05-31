import React from 'react';
import {
  TouchableOpacityProps,
  TouchableOpacity,
  TextStyle,
} from 'react-native';
import { RatsText } from '../rats-text';
import { fontSize, normalize, color } from '../../styles/theme';

interface RatsListItemProps extends TouchableOpacityProps {
  mainText: string;
  subText: string;
  mainTextStyle?: TextStyle;
  subTextStyle?: TextStyle;
}

const RatsListItem = (props: RatsListItemProps) => {
  return (
    <TouchableOpacity
      {...props}
      style={[{ width: '100%', padding: normalize(10) }, props.style]}>
      <RatsText
        text={props.mainText}
        style={[{ fontSize: fontSize.medium }, props.mainTextStyle]}
        translate={false}
      />
      <RatsText
        text={props.subText}
        style={[{ color: color.grey }, props.subTextStyle]}
      />
    </TouchableOpacity>
  );
};

export default RatsListItem;
