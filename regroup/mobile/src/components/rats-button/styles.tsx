import { StyleSheet } from 'react-native';
import { normalize, color, fontSize, fontFamily } from '../../styles/theme';

const styles = StyleSheet.create({
  button: {
    color: color.white,
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.bold,
    // paddingVertical: normalize(20)
    alignSelf: 'center',
  },
  buttonContainer: {
    // padding: normalize(10),
    height: normalize(50),
    // overflow: 'hidden',
    borderRadius: 5,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.2,
  },
});

export default styles;
