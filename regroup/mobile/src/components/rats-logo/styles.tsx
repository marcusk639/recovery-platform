import { StyleSheet } from 'react-native';
import { normalize, fontFamily, color, fontSize } from '../../styles/theme';

const logoStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: normalize(200),
    height: normalize(200),
  },
  logoName: {
    fontSize: normalize(55),
    fontFamily: fontFamily.bold,
    textAlignVertical: 'center',
    includeFontPadding: false,
    // textShadowOffset: {
    //   width: 2,
    //   height: 2
    // },
    // textShadowColor: color.black,
    // textShadowRadius: 10,
    // color: color.white
  },
  logoDescription: {
    fontFamily: fontFamily.roboto,
    fontSize: fontSize.regular_medium,
    textAlignVertical: 'center',
    includeFontPadding: false,
    textAlign: 'center',
  },
  horizontalContainer: {
    flexDirection: 'row',
    // justifyContent: 'space-around',
    alignItems: 'center',
  },
  hzLogoText: {
    fontSize: normalize(55),
    fontFamily: fontFamily.bold,
    // textAlignVertical: 'center',
    includeFontPadding: false,
  },
  hzLogoDescription: {
    fontFamily: fontFamily.roboto,
    fontSize: fontSize.regular_medium,
    textAlignVertical: 'center',
    // includeFontPadding: false,
    marginTop: normalize(5),
    textAlign: 'center',
  },
});

export default logoStyles;
