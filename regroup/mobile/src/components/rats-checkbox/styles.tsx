import { StyleSheet } from 'react-native';
import { normalize, color } from '../../styles/theme';

const styles = StyleSheet.create({
  view: {
    flexDirection: 'row',
    marginRight: normalize(5),
    marginTop: normalize(5),
    marginBottom: normalize(5),
  },
  checkbox: {},
  error: {
    color: color.red,
  },
});

export default styles;
