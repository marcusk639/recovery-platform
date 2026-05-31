// src/theme/index.ts
import {colors} from './colors';
import {spacing} from './spacing';
import {fonts, fontSizes} from './fonts';

export const theme = {
  colors,
  spacing,
  fonts,
  fontSizes,
  roundness: 8,
};

export type Theme = typeof theme;

export default theme;
