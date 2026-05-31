import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import React from 'react';
import {
  TextStyle,
  TouchableOpacityProps,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { fontSize, normalize } from '../../styles/theme';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { color } from '../../styles/theme';

interface IconProps {
  name?: string;
  size?: number;
  style?: TextStyle[] | TextStyle;
  [prop: string]: any;
}

const ICON_STYLE: TextStyle = {
  fontSize: fontSize.regular,
};

export const RatsIcon = (props: IconProps) => {
  return (
    <FontAwesome5
      {...props}
      name={props.name || ''}
      size={props.size || fontSize.regular}
      style={[
        ICON_STYLE,
        props.style,
        { fontSize: props.size || fontSize.regular },
      ]}
    />
  );
};

interface ClickableIconProps {
  containerProps?: TouchableOpacityProps;
  iconProps?: IconProps;
}

export const ClickableIcon = (props: ClickableIconProps) => {
  return (
    <TouchableOpacity {...props.containerProps}>
      <RatsIcon {...props.iconProps} />
    </TouchableOpacity>
  );
};

export const getBackIcon = (props: any = {}) => {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={{ paddingRight: 20, paddingLeft: 15, ...props.style }}>
      <Icon name="arrow-back" size={fontSize.larger} color={color.black} />
    </TouchableOpacity>
  );
};

// Alias for backward compatibility
export const BackButton = getBackIcon;
