import React from 'react';
import { View, ViewStyle, TextStyle } from 'react-native';
import {
  ROW,
  normalize,
  fontSize,
  color,
  fontFamily,
} from '../../styles/theme';
import RatsAvatar from '../rats-avatar';
import { RatsText } from '../rats-text';
import { IOS } from '../../util/platform';

interface Props {
  name: string;
  type: string;
  avatarUrl: string | null;
  container?: ViewStyle;
  avatarStyle?: any;
  nameStyle?: TextStyle;
  subTextStyle?: TextStyle;
}

const AvatarItem = (props: Props) => {
  const {
    name,
    type,
    container = {},
    avatarStyle = {},
    nameStyle = {},
    subTextStyle = {},
    avatarUrl = null,
  } = props;
  return (
    <View style={[ROW, container]}>
      <RatsAvatar
        name={name}
        style={{
          height: normalize(45),
          width: normalize(45),
          borderRadius: IOS ? normalize(22) : normalize(45),
          marginRight: normalize(15),
          ...avatarStyle,
        }}
        source={avatarUrl ? { uri: avatarUrl } : ({} as any)}
        resizeMethod="resize"
        resizeMode="cover"
      />
      <View>
        <RatsText
          text={name}
          translate={false}
          style={{
            fontSize: fontSize.medium,
            fontFamily: fontFamily.bold,
            ...nameStyle,
          }}
        />
        <RatsText
          text={type}
          translate={false}
          style={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
            ...subTextStyle,
          }}
        />
      </View>
    </View>
  );
};

export default AvatarItem;
