// The phone scales its sizes from the screen's short side against a 350-wide
// design. In a browser that side is the desktop window, so everything came out
// about 1.8 times as big. Here the sizes are those of a common 390 by 844 phone,
// whatever the window.
const PHONE_SHORT = 390;
const PHONE_LONG = 844;
const BASE_WIDTH = 350;
const BASE_HEIGHT = 680;

export const scale = (size: number): number => (PHONE_SHORT / BASE_WIDTH) * size;
export const verticalScale = (size: number): number => (PHONE_LONG / BASE_HEIGHT) * size;
export const moderateScale = (size: number, factor = 0.5): number => size + (scale(size) - size) * factor;
export const moderateVerticalScale = (size: number, factor = 0.5): number =>
  size + (verticalScale(size) - size) * factor;

export const s = scale;
export const vs = verticalScale;
export const ms = moderateScale;
export const mvs = moderateVerticalScale;
