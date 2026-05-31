import { StyleSheet } from 'react-native';
import { normalize, color, fontSize, fontFamily } from '../../styles/theme';
import { IOS } from '../../util/platform';

const styles = {
  primary: StyleSheet.create({
    container: {
      padding: normalize(5),
    },
    labelContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    inputView: {
      flexDirection: 'row',
      borderColor: color.black,
      borderWidth: 1,
      backgroundColor: color.white,
    },
    input: {
      width: '100%',
      height: normalize(30),
      padding: normalize(5),
      paddingTop: IOS ? normalize(10) : normalize(5),
    },
    error: {
      color: color.red,
    },
  }),
  secondary: StyleSheet.create({
    container: {
      marginVertical: normalize(10),
      // padding: normalize(5),
    },
    labelContainer: {
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      alignContent: 'flex-end',
    },
    inputView: {
      flexDirection: 'row',
      borderWidth: normalize(0.75),
      borderRadius: 5,
      borderColor: color.dark_grey,
    },
    input: {
      width: '100%',
      height: IOS ? normalize(40) : normalize(42.5),
      paddingHorizontal: normalize(10),
      textAlignVertical: 'top',
      paddingTop: IOS ? normalize(10) : undefined,
      // borderBottomColor: color.black,
      // borderBottomWidth: 1,
      fontSize: fontSize.medium,
      fontFamily: fontFamily.roboto,
    },
    error: {
      color: color.red,
      marginBottom: 0,
      alignSelf: 'flex-start',
      fontSize: fontSize.small,
    },
  }),
};

export default styles;
