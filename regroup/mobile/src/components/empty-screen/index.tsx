import React from 'react';
import { View, ViewStyle } from 'react-native';
import { RatsIcon } from '../rats-icon/rats-icon';
import { RatsText } from '../rats-text';
import RatsButton from '../rats-button/rats-button';
import { color, fontSize, normalize } from '../../styles/theme';

interface Props {
  icon: string;
  message: string;
  buttonTitle: string;
  onPress: () => void;
  containerStyle?: ViewStyle;
}
const EmptyScreen = ({
  icon,
  message,
  buttonTitle,
  onPress,
  containerStyle,
}: Props) => {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: color.light_grey,
          alignItems: 'center',
          justifyContent: 'center',
        },
        containerStyle,
      ]}>
      <RatsIcon
        name={icon}
        size={normalize(90)}
        style={{ color: color.dark_grey, marginBottom: normalize(20) }}
      />
      <RatsText
        text={message}
        style={{
          color: color.black,
          fontSize: fontSize.medium_large,
          textAlign: 'center' as const,
        }}
      />
      <RatsButton
        title={buttonTitle}
        containerStyle={{
          backgroundColor: undefined,
          borderColor: color.baby_blue,
          borderWidth: 1.5,
          marginTop: normalize(15),
          height: normalize(35),
          width: normalize(150),
          alignSelf: 'center',
        }}
        style={{ color: color.baby_blue, fontSize: fontSize.regular }}
        onPress={onPress}
      />
    </View>
  );
};

export default EmptyScreen;
