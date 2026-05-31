import { StyleSheet } from 'react-native';
import { color, normalize, fontSize, fontFamily } from '../../styles/theme';

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: fontSize.medium,
    paddingHorizontal: 10,
    paddingVertical: normalize(10),
    borderWidth: normalize(0.75),
    borderColor: color.dark_grey,
    fontFamily: fontFamily.roboto,
    borderRadius: normalize(5),
    color: color.black,
    paddingRight: normalize(30), // to ensure the text is never behind the icon
    // width: '94%'
  },
  inputAndroid: {
    fontSize: fontSize.medium,
    paddingHorizontal: 10,
    paddingVertical: normalize(7.5),
    fontFamily: fontFamily.roboto,
    borderWidth: normalize(0.75),
    borderColor: color.dark_grey,
    borderRadius: normalize(5),
    color: color.black,
    paddingRight: normalize(30), // to ensure the text is never behind the icon,
    // width: '100%'
  },
});

const styles = StyleSheet.create({
  viewContainer: {
    width: '100%',
    alignSelf: 'center',
    margin: normalize(10),
  },
  error: {
    color: color.red,
    fontSize: fontSize.small,
  },
});

export { pickerSelectStyles, styles };
