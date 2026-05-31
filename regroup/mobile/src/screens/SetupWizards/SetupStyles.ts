import { ViewStyle, Dimensions, TextStyle } from 'react-native';
import {
  normalize,
  elevateStyle,
  color,
  ROW,
  fontSize,
  fontFamily,
} from '../../styles/theme';

export const SETUP_BUTTON_STYLE: ViewStyle = {
  margin: normalize(10),
  width: Dimensions.get('screen').width * 0.8,
  height: normalize(70),
  ...elevateStyle,
  backgroundColor: color.white,
  alignItems: 'center',
  justifyContent: 'space-evenly',
  alignSelf: 'center',
  borderWidth: 1,
  borderColor: color.black,
  borderRadius: normalize(10),
  marginLeft: normalize(5),
  marginRight: normalize(5),
};

export const SECTION_TITLE: ViewStyle = {
  width: normalize(300),
  height: normalize(50),
  backgroundColor: color.grey,
};

export const SECTION_HEADER: ViewStyle = {
  width: normalize(300),
  height: normalize(50),
  backgroundColor: color.medium_grey,
  alignItems: 'center',
  padding: normalize(10),
  borderRadius: 1,
  ...ROW,
};

export const SECTION_HEADER_TEXT: TextStyle = {
  fontSize: fontSize.medium,
  fontFamily: fontFamily.roboto,
};

export const SECTION_CONTENT: ViewStyle = {
  padding: 20,
  backgroundColor: color.white,
  height: normalize(200),
};

export const NEXT_BUTTON_TEXT: TextStyle = {
  color: color.white,
  fontSize: fontSize.medium - 2,
};

export const NEXT_BUTTON: ViewStyle = {
  backgroundColor: color.green,
  borderColor: color.green,
  borderWidth: 1.5,
  width: '95%',
  alignSelf: 'center',
  marginTop: normalize(10),
};
