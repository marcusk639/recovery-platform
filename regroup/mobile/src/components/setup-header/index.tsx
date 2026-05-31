import React, { PropsWithChildren } from 'react';
import { View, ViewStyle } from 'react-native';
import { RatsText } from '../rats-text';
import {
  ROW,
  normalize,
  CARD_STYLE,
  fontSize,
  color,
  fontFamily,
} from '../../styles/theme';
import BoxedIcon from '../rats-icon/boxed-icon';

interface Props {
  header: string;
  rightSideContainer?: ViewStyle;
  icon: string;
  iconBackgroundColor: string;
  description: string;
}

const SetupHeader = ({
  header,
  icon,
  iconBackgroundColor,
  rightSideContainer,
  description,
}: PropsWithChildren<Props>) => {
  return (
    <View
      style={[
        CARD_STYLE,
        { justifyContent: 'center', padding: normalize(15) },
      ]}>
      <View style={[ROW, { flex: 1 }]}>
        <View style={{ flex: 0.3 }}>
          <BoxedIcon
            name={icon}
            iconSize={normalize(50)}
            backgroundColor={iconBackgroundColor}
            container={{
              height: normalize(80),
              width: normalize(80),
              paddingVertical: normalize(5),
            }}
          />
        </View>
        <View style={[{ flex: 0.75 }, rightSideContainer]}>
          <RatsText
            text={header}
            style={{
              fontSize: fontSize.regular_medium,
              color: color.black,
              fontFamily: fontFamily.bold,
            }}
          />
          <RatsText
            text={description}
            style={{ fontSize: fontSize.regular_medium, color: color.black }}
          />
        </View>
      </View>
    </View>
  );
};

export default SetupHeader;
