import { StyleSheet } from 'react-native';
import {
  normalize,
  fontSize,
  primaryColors,
  fontFamily,
  color,
} from '../../styles/theme';

const styles = StyleSheet.create({
  label: {
    marginBottom: normalize(5),
    fontFamily: fontFamily.roboto,
    fontSize: fontSize.medium,
    color: color.dark_grey,
  },
});

export default styles;
