import font from '@react-native-vector-icons/ionicons/fonts/Ionicons.ttf';
import glyphs from '@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json';
import { Glyph, registerFont, type IconProps } from './create-icon';

registerFont('Ionicons', font);

export default function Ionicons(props: IconProps) {
  return <Glyph {...props} family="Ionicons" glyphs={glyphs} />;
}
