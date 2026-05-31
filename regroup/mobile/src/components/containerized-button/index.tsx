import React from 'react';
import {
  View,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { RatsIcon } from '../rats-icon/rats-icon';
import { RatsText } from '../rats-text';
import { fontSize, ROW, fontFamily, normalize } from '../../styles/theme';

interface ContainerizedButtonProps {
  containerStyle?: ViewStyle;
  touchableOpacityStyle?: ViewStyle;
  iconName?: string;
  iconStyle?: TextStyle;
  title: string;
  titleStyle?: TextStyle;
  description?: string;
  descriptionStyle?: TextStyle;
  titleContainerStyle?: ViewStyle;
  onPress: () => void;
}

export const ContainerizedButton = (
  props: ContainerizedButtonProps & Partial<TouchableOpacityProps>,
) => {
  const {
    containerStyle,
    titleContainerStyle,
    touchableOpacityStyle,
    iconName,
    iconStyle,
    title,
    titleStyle,
    description,
    descriptionStyle,
  } = props;
  return (
    <View style={[{ justifyContent: 'center' }, containerStyle]}>
      <TouchableOpacity
        {...props}
        style={[ROW, { padding: normalize(15) }, touchableOpacityStyle]}>
        <View style={[ROW, { flex: 0.5 }, titleContainerStyle]}>
          {iconName && (
            <RatsIcon
              name={iconName}
              size={fontSize.large}
              style={[{ marginRight: normalize(5) }, iconStyle || {}]}
            />
          )}
          <RatsText
            text={title}
            style={[
              { fontFamily: fontFamily.roboto, fontSize: fontSize.medium },
              titleStyle,
            ]}
          />
        </View>
        <View style={{ flex: 0.5 }}>
          {description && (
            <RatsText
              text={description}
              style={[
                {
                  fontFamily: fontFamily.roboto,
                  fontSize: fontSize.small,
                  alignSelf: 'center' as const,
                },
                descriptionStyle,
              ]}
            />
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};
