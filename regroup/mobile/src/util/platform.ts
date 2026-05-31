import { Platform, Dimensions } from 'react-native';
import { getBottomSpace, isIphoneX } from 'react-native-iphone-x-helper';
export const IOS = Platform.OS === 'ios';
export const ANDROID = Platform.OS === 'android';
export const IS_X = isIphoneX();
export const bottomSpace = getBottomSpace();

export const isLandscape = () => {
  const dim = Dimensions.get('screen');
  return dim.width >= dim.height;
};

export function tabBarHeight() {
  const majorVersion = parseInt(Platform.Version as string, 10);
  const isIos = Platform.OS === 'ios';
  const isIOS11 = majorVersion >= 11 && isIos;
  if (isIOS11 && !isLandscape()) {
    return 49;
  }
  return 29;
}
