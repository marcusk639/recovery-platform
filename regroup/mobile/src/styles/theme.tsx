import { Dimensions, Platform, ViewStyle, TextStyle } from 'react-native';
import { moderateScale as normalize } from 'react-native-size-matters';
import { createTheming, ThemingType } from '@callstack/react-theme-provider';
import { IOS } from '../util/platform';

const color = {
  black: 'black',
  light_black: '#414141',
  main: 'rgb(99,139,250)',
  white: '#ffffff',
  light_grey: '#eaeaea',
  medium_grey: '#d3d3d3',
  grey: '#969696',
  dark_grey: '#707070',
  red: '#bb0000',
  light_red: '#ffcccb',
  orange: '#FF4500',
  // green: '#216C2A',
  green: '#009A39',
  light_green: '#4aae4f',
  green_blue: '#448580',
  blue_green: '#446a85',
  pink: '#cc00a3',
  dark_purple: '#23195e',
  underlayColor: '#ddd',
  cobalt: '#0047ab',
  yellow: '#ffbf00',
  darkYellow: '#ebc634',
  blue: '#0000B2',
  bright_blue: '#00FFFF',
  light_blue: '#d2d8ef',
  medium_blue: '#9aa7db',
  dark_blue: '#00008b',
  // baby_blue: '#1ca3eb',
  baby_blue: '#0094C6',
  dark_baby_blue: '#006695',
  chat_blue: '#0094C6',
  purple: '#831CAC',
  light_purple: '#8D4BEB',
  baby_green: '#5dd97e',
  peach: '#d16949',
  basic_blue: '#0066FF',
  intermediate_blue: '#0033FF',
  advanced_blue: '#0000CC',
};

const SCROLL_CONTAINER: ViewStyle = {
  flexGrow: 1,
  justifyContent: 'flex-start',
  backgroundColor: color.light_grey,
};

const CENTERED_CONTAINER: ViewStyle = {
  alignItems: 'center',
  flex: 1,
};

const fontSize = {
  extraSmall: normalize(10),
  small: normalize(12),
  regular: normalize(14),
  regular_medium: normalize(15),
  regular_medium2: normalize(16),
  medium: normalize(17),
  medium_large: normalize(19),
  large: normalize(21),
  larger: normalize(25),
  extraLarge: normalize(30),
  extraLarger: normalize(35),
  huge: normalize(40),
  huger: normalize(50),
  massive: normalize(60),
};

const fontFamily = {
  // extrabold: 'RobotoExtraBold',
  // bold: 'Oswald-Bold',
  // medium: 'Oswald-Medium',
  // regular: 'oswald',
  // light: Platform.OS === 'ios' ? 'System' : 'RobotoLight',
  // roboto: Platform.OS === 'ios' ? 'System' : 'Roboto',
  light: 'Quicksand-Light',
  roboto: 'Quicksand-Medium',
  bold: 'Quicksand-Bold',
  timesNewRoman: 'Times New Roman',
};

const STAT_BUTTON: ViewStyle = {
  height: normalize(50),
  width: '100%',
  borderRadius: 5,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1.5,
};

const HEADER: TextStyle = {
  fontSize: fontSize.large,
  marginVertical: normalize(10),
  alignSelf: 'flex-start',
  marginLeft: normalize(10),
};

const SAVE_BUTTON: ViewStyle = {
  ...STAT_BUTTON,
  backgroundColor: color.green,
  borderColor: color.green,
  borderWidth: 1,
};

const STAT_BUTTON_TEXT: TextStyle = {
  fontFamily: fontFamily.bold,
  fontSize: fontSize.regular_medium,
};

const primaryColors = {
  primary: color.blue,
  secondary: color.black,
  tertiary: color.light_blue,
  androidLight: '#FAFAFA',
};

const ROW: ViewStyle = {
  flexDirection: 'row',
};

const CENTER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

const barStyle: ViewStyle = {
  height: '8%',
  alignSelf: 'stretch',
  backgroundColor: color.black,
  flexDirection: 'row',
  alignItems: 'center',
};

const shadowStyle: ViewStyle = {
  shadowColor: color.grey,
  shadowOpacity: 1,
  shadowRadius: IOS ? 0.5 : undefined,
  shadowOffset: {
    height: 2,
    width: 0,
  },
};

const CIRCLE: ViewStyle = {
  height: normalize(35),
  width: normalize(35),
  borderRadius: normalize(17.5),
  marginRight: normalize(5),
  justifyContent: 'center',
  alignItems: 'center',
};

const elevateStyle: ViewStyle = {
  ...shadowStyle,
  elevation: IOS ? normalize(1) : normalize(5),
};

const undoElevateStyle: ViewStyle = {};
Object.getOwnPropertyNames(elevateStyle).forEach(
  key => ((undoElevateStyle as Record<string, any>)[key] = undefined),
);

const tabBarStyle: ViewStyle = {
  ...elevateStyle,
  // shadowRadius: 50,
  shadowOffset: {
    height: 10,
    width: 0,
  },
  elevation: 10,
  backgroundColor: color.white,
  width: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  // position: 'absolute',
};

const MODAL_STYLE: ViewStyle = {
  padding: 0,
  margin: 0,
  alignItems: undefined,
  justifyContent: undefined,
  height: Dimensions.get('screen').height,
};

const MODAL_CONTAINER_STYLE: ViewStyle = {
  flex: 1,
  padding: 0,
  margin: 0,
  backgroundColor: color.light_grey,
};

const CARD_NO_ELEVATION: ViewStyle = {
  backgroundColor: color.white,
  padding: normalize(10),
  width: '100%',
};

const CARD_STYLE: ViewStyle = {
  ...CARD_NO_ELEVATION,
};

const RED_BUTTON: ViewStyle = {
  borderColor: color.red,
  backgroundColor: color.white,
};

const RED_BUTTON_TEXT: TextStyle = {
  color: color.red,
};

const MODAL_BUTTON_CONTAINER: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 0,
  paddingTop: normalize(15),
  paddingBottom: normalize(10),
  marginTop: 'auto',
  shadowRadius: 50,
  width: '100%',
  shadowOffset: {
    height: 20,
    width: 10,
  },
  elevation: 10,
};

const FILTER_HEADER: ViewStyle = {
  ...undoElevateStyle,
  justifyContent: 'center',
  height: normalize(40),
  paddingHorizontal: 0,
};

const CLEAR_FILTER: TextStyle = {
  color: color.baby_blue,
  borderBottomWidth: 1,
  borderBottomColor: color.baby_blue,
  fontFamily: fontFamily.bold,
  fontSize: fontSize.medium,
};

const FILTER_CONFIRM_BUTTONS: ViewStyle = {
  ...MODAL_BUTTON_CONTAINER,
  ...undoElevateStyle,
  borderTopWidth: 1,
  borderTopColor: color.grey,
  marginTop: normalize(20),
};

const CONFIRM_BUTTONS: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 0,
  paddingTop: normalize(15),
  paddingBottom: normalize(15),
  marginTop: 'auto',
  shadowRadius: 50,
  shadowOffset: {
    height: 20,
    width: 10,
  },
  elevation: 10,
};

const padding = 8;
const navbarHeight = Platform.OS === 'ios' ? 64 : 54;
const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const tabColor =
  Platform.OS === 'ios' ? 'rgba(73,75,76, .5)' : 'rgba(255,255,255,.8)';
const selectedTabColor = Platform.OS === 'ios' ? 'rgb(73,75,76)' : '#fff';

const tabIconStyle = { size: 21, color: tabColor, selected: selectedTabColor };

const navTitleStyle = {
  fontSize: fontSize.regular,
  fontFamily: fontFamily.roboto,
  color: color.black,
};

const navBar = { backgroundColor: 'black' };

const title = {
  fontFamily: fontFamily.roboto,
  color: color.white,
  fontWeight: 'normal',
};

const summaryTitle = {
  color: color.white,
  fontFamily: fontFamily.bold,
};

const tabLabelStyle = { fontFamily: fontFamily.roboto, color: 'black' };

export interface RatsTheme {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  backgroundColor: string;
  textColor: string;
  primaryFontFamily: string;
  secondaryFontFamily: string;
  logoTintColor: string;
}

const themes: { [key: string]: RatsTheme } = {
  default: {
    primaryColor: color.blue,
    secondaryColor: color.light_blue,
    tertiaryColor: color.grey,
    backgroundColor: primaryColors.androidLight,
    textColor: color.black,
    primaryFontFamily: fontFamily.roboto,
    secondaryFontFamily: fontFamily.roboto,
    logoTintColor: color.white,
  },
};

const { ThemeProvider, withTheme, useTheme: useThemeHook }: ThemingType<RatsTheme> = createTheming(
  themes.default,
);

export {
  MODAL_STYLE,
  HEADER,
  FILTER_CONFIRM_BUTTONS,
  CONFIRM_BUTTONS,
  FILTER_HEADER,
  CLEAR_FILTER,
  CARD_NO_ELEVATION,
  MODAL_CONTAINER_STYLE,
  STAT_BUTTON,
  STAT_BUTTON_TEXT,
  SAVE_BUTTON,
  CIRCLE,
  tabLabelStyle,
  color,
  fontSize,
  fontFamily,
  padding,
  navbarHeight,
  windowWidth,
  windowHeight,
  tabIconStyle,
  navTitleStyle,
  normalize,
  navBar,
  title,
  primaryColors,
  ThemeProvider,
  withTheme,
  useThemeHook,
  themes,
  summaryTitle,
  elevateStyle,
  barStyle,
  tabBarStyle,
  ROW,
  CENTERED_CONTAINER,
  SCROLL_CONTAINER,
  CARD_STYLE,
  MODAL_BUTTON_CONTAINER,
  RED_BUTTON,
  RED_BUTTON_TEXT,
  undoElevateStyle,
  CENTER,
};
