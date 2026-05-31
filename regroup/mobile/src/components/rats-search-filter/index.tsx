import React from 'react';
import Card from '../card';
import { RatsIcon } from '../rats-icon/rats-icon';
import { RatsText } from '../rats-text';
import { normalize, fontSize, color } from '../../styles/theme';
import { TextStyle, ViewStyle } from 'react-native';

const FILTER_CONTAINER: ViewStyle = {
  height: normalize(30),
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'center',
  margin: normalize(10),
  flex: 0,
  padding: normalize(10),
  borderRadius: normalize(5),
  borderWidth: normalize(1),
  marginRight: 0,
};

const FILTER_TEXT: TextStyle = {
  fontSize: fontSize.medium,
};

interface Props {
  onPress: () => void;
  active: boolean;
  filterName: string;
  iconName: string;
  containerStyle?: ViewStyle;
  iconSize?: number;
}
const RatsSearchFilter = (props: Props) => {
  const {
    onPress,
    active = false,
    filterName,
    iconName,
    containerStyle,
    iconSize,
  } = props;
  return (
    <Card
      onPress={onPress}
      containerStyle={{
        ...FILTER_CONTAINER,
        backgroundColor: active ? color.black : color.white,
        ...containerStyle,
      }}>
      <RatsIcon
        name={iconName}
        size={iconSize || fontSize.large}
        style={{
          color: active ? color.white : color.black,
          marginRight: normalize(10),
        }}
      />
      <RatsText
        style={{ ...FILTER_TEXT, color: active ? color.white : color.black }}
        text={filterName}
      />
    </Card>
  );
};

export default RatsSearchFilter;
