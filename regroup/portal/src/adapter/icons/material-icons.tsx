import font from '@react-native-vector-icons/material-icons/fonts/MaterialIcons.ttf';
import glyphs from '@react-native-vector-icons/material-icons/glyphmaps/MaterialIcons.json';
import { Glyph, registerFont, type IconProps } from './create-icon';

registerFont('MaterialIcons', font);

export default function MaterialIcons(props: IconProps) {
  return <Glyph {...props} family="MaterialIcons" glyphs={glyphs} />;
}
