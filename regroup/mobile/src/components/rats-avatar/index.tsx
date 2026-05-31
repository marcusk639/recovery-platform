import React, { useState } from 'react';
import { View, ImageProps, ViewStyle, TextStyle } from 'react-native';
import { RatsImage } from '../rats-image';
import { normalize, color, fontFamily } from '../../styles/theme';
import { RatsText } from '../rats-text';
import { IOS } from '../../util/platform';

interface RatsAvatarProps extends ImageProps {
  name: string;
  placeholderStyle?: ViewStyle;
  placeholderTextStyle?: TextStyle;
}

const imageStyles = {
  height: normalize(45),
  width: normalize(45),
  marginRight: normalize(15),
};

const imagePlaceholderStyle: ViewStyle = {
  backgroundColor: color.medium_grey,
  height: normalize(90),
  width: normalize(90),
  borderRadius: normalize(45),
  marginRight: normalize(5),
  justifyContent: 'center',
  alignItems: 'center',
};

const imagePlaceholderTextStyle: TextStyle = {
  color: color.white,
  fontSize: (imagePlaceholderStyle.height as number) / 2,
  fontFamily: fontFamily.roboto,
};

const getInitials = (name: string) => {
  const nameParts = name ? name.split(' ') : ['', ''];
  const first = nameParts && nameParts[0];
  const second = nameParts && nameParts.length && nameParts[1];
  return {
    first: first ? first.charAt(0).toUpperCase() : '',
    second: second ? second.charAt(0).toUpperCase() : '',
  };
};

export const stringToColour = (
  str: string,
  saturation: number = 80,
  lightness: number = 60,
) => {
  if (!str) {
    return;
  }
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  var h = hash % 360;
  return 'hsl(' + h + ', ' + saturation + '%, ' + lightness + '%)';
};

const RatsAvatar = (props: RatsAvatarProps) => {
  const { name, placeholderStyle, placeholderTextStyle, source, style, ...restProps } = props;
  const { first, second } = getInitials(name);
  const [viewLayout, setViewLayout] = useState({ height: 0, width: 0 });
  //@ts-ignore
  if (source && source.uri) {
    return (
      <RatsImage
        source={source}
        style={style || imageStyles}
        {...restProps}
      />
    );
  } else {
    return (
      <View
        onLayout={event =>
          setViewLayout({
            height: event.nativeEvent.layout.height,
            width: event.nativeEvent.layout.width,
          })
        }
        style={[
          imagePlaceholderStyle,
          placeholderStyle,
          { backgroundColor: stringToColour(name) },
          props.style,
        ]}>
        <RatsText
          translate={false}
          text={first + second}
          style={[
            placeholderTextStyle || imagePlaceholderTextStyle,
            {
              fontSize: viewLayout.height / 2,
              paddingBottom: IOS ? 0 : normalize(3),
            },
          ]}
        />
      </View>
    );
  }
};

export default RatsAvatar;
