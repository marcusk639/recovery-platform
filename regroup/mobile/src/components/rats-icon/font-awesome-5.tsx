/**
 * FontAwesome5 for the app: @react-native-vector-icons/fontawesome5 14 with the style selection of
 * react-native-vector-icons 9, which the app was written against.
 *
 * v9 took a `solid` (or `brand`) flag and, when the glyph did not exist in that style, fell back
 * to the first style that has it (brands, then regular, then solid). So `<FontAwesome5
 * name="cog" />` rendered the solid cog, because there is no regular one. v14 takes `iconStyle`,
 * defaults to regular and renders a blank glyph for a name that style lacks. Every FontAwesome5
 * icon in the app goes through this module (ESLint enforces it), so names keep rendering exactly
 * as before. The v9 and v14 glyph sets are identical (decision record, Task 5).
 */
import React from 'react';
import type { TextProps } from 'react-native';
import BaseFontAwesome5 from '@react-native-vector-icons/fontawesome5/static';
import metadata from '@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_meta.json';

export type FontAwesome5Style = 'brand' | 'regular' | 'solid';

const GLYPHS: Record<FontAwesome5Style, ReadonlySet<string>> = {
  brand: new Set(metadata.brand),
  regular: new Set(metadata.regular),
  solid: new Set(metadata.solid),
};

/** v9's fallback order (its metadata key order). */
const FALLBACK_ORDER: FontAwesome5Style[] = ['brand', 'regular', 'solid'];

/** The style react-native-vector-icons 9 rendered `name` in, given its `solid` / `brand` flags. */
export function fontAwesome5Style(name: string, solid?: boolean, brand?: boolean): FontAwesome5Style {
  const requested: FontAwesome5Style = brand ? 'brand' : solid ? 'solid' : 'regular';
  if (GLYPHS[requested].has(name)) {
    return requested;
  }
  return FALLBACK_ORDER.find((style) => GLYPHS[style].has(name)) ?? 'regular';
}

export interface RatsFontAwesome5Props extends TextProps {
  name: string;
  size?: number;
  color?: string;
  solid?: boolean;
  brand?: boolean;
  [prop: string]: unknown;
}

export const RatsFontAwesome5 = ({ solid, brand, ...props }: RatsFontAwesome5Props) => {
  const Icon = BaseFontAwesome5 as unknown as React.ComponentType<Record<string, unknown>>;
  return <Icon {...props} iconStyle={fontAwesome5Style(props.name, solid, brand)} />;
};

export default RatsFontAwesome5;
