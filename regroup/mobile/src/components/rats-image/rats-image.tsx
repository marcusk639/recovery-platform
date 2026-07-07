import React from "react";
import { Image, ImageProps } from "react-native";
import imageStyles from "./styles";

interface Props extends Partial<ImageProps> {
  style?: any;
}

const RatsImage = (props: Props) => (
  // Hardened 2026-07-05: style={imageStyles || props.style} always evaluated
  // to imageStyles (a plain object literal, always truthy) regardless of
  // whether the caller passed a custom style — a fragile pattern that only
  // happened to work when the trailing {...props} spread also carried a
  // `style` key back in afterward. Spreading first and setting style/source
  // last makes the intended precedence (custom style wins, default is the
  // fallback) explicit and independent of prop ordering.
  <Image {...props} source={props.source!} style={props.style || imageStyles} />
);

export default RatsImage;
