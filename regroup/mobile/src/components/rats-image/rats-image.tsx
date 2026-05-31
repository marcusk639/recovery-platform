import React from 'react';
import { Image, ImageProps } from 'react-native';
import imageStyles from './styles';

interface Props extends Partial<ImageProps> {
  style?: any;
}

const RatsImage = (props: Props) => (
  <Image style={imageStyles || props.style} source={props.source!} {...props} />
);

export default RatsImage;
