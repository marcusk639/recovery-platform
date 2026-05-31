import { StyleSheet } from 'react-native';
import { color, fontSize, normalize, fontFamily } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    // paddingTop: normalize(50),
    flexGrow: 1,
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(20),
    // alignItems: 'center',
    // justifyContent: 'space-evenly'
  },
  loginHeader: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  marginVertical: {
    marginTop: normalize(20),
    marginBottom: normalize(15),
  },
  header: {
    fontSize: fontSize.extraLarge,
    fontFamily: fontFamily.roboto,
    textAlign: 'center',
  },
  verifyEmail: {
    fontSize: fontSize.large,
    fontFamily: fontFamily.roboto,
    textAlign: 'center',
  },
  subheader: {
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.roboto,
  },
  signUpText: {
    fontSize: fontSize.huge,
    textAlign: 'center',
    color: color.black,
  },
  signUpForm: {
    justifyContent: 'center',
    alignItems: 'center',
    // paddingHorizontal: normalize(45),
    // flex: 1
  },
  errorContainer: {
    flex: 0.2,
    alignSelf: 'flex-start',
  },
  errorMessage: {
    color: color.red,
    fontSize: fontSize.medium,
    fontFamily: fontFamily.roboto,
  },
  checkboxLabel: {
    fontSize: fontSize.small,
    marginTop: normalize(5),
  },
});

export default styles;
