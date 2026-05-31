import { ViewStyle, TextStyle } from 'react-native';
import { color, fontFamily, fontSize } from '../../styles/theme';

const baseTabStyle: ViewStyle = {
  width: '50%',
  alignItems: 'center',
  height: '100%',
  justifyContent: 'center',
};

const baseTextStyle: TextStyle = {
  fontSize: fontSize.regular_medium,
  color: color.white,
  fontFamily: fontFamily.bold,
};

const selectedTabStyle: ViewStyle = {
  ...baseTabStyle,
  borderBottomColor: color.white,
  borderBottomWidth: 2,
};

const selectedTextStyle: TextStyle = { ...baseTextStyle };

export { baseTabStyle, baseTextStyle, selectedTabStyle, selectedTextStyle };
