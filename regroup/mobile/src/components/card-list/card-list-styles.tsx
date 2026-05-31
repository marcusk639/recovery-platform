import { ViewStyle, TextStyle } from 'react-native';
import {
  normalize,
  color,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';

export const dailyLogHeader: ViewStyle = {
  height: normalize(30),
  borderBottomColor: color.grey,
  borderBottomWidth: 1,
  width: '100%',
  justifyContent: 'center',
};

export const dailyLogHeaderText: TextStyle = {
  fontSize: fontSize.regular_medium,
  fontFamily: fontFamily.bold,
  marginLeft: normalize(10),
};

export const activityText: TextStyle = {
  fontSize: fontSize.regular_medium,
};

export const itemContent: ViewStyle = {
  ...CARD_STYLE,
  width: '100%',
  paddingVertical: normalize(15),
  alignSelf: 'stretch',
};

export const ITEM_CONTAINER: ViewStyle = {
  padding: normalize(10),
  borderWidth: 1,
  borderRadius: 5,
};

export const SECTION_HEADER: ViewStyle = { flexDirection: 'row' };
