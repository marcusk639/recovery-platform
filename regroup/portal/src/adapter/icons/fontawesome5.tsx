import brandFont from '@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Brands.ttf';
import regularFont from '@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Regular.ttf';
import solidFont from '@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Solid.ttf';
import brandGlyphs from '@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_brand.json';
import regularGlyphs from '@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_regular.json';
import solidGlyphs from '@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_solid.json';
import { Glyph, registerFont, type IconProps } from './create-icon';

const STYLES = {
  brand: { family: 'FontAwesomeBrands', glyphs: brandGlyphs },
  regular: { family: 'FontAwesomeRegular', glyphs: regularGlyphs },
  solid: { family: 'FontAwesomeSolid', glyphs: solidGlyphs },
};

registerFont(STYLES.brand.family, brandFont);
registerFont(STYLES.regular.family, regularFont);
registerFont(STYLES.solid.family, solidFont);

export default function FontAwesome5({
  iconStyle = 'regular',
  ...props
}: IconProps & { iconStyle?: keyof typeof STYLES }) {
  return <Glyph {...props} {...STYLES[iconStyle]} />;
}
