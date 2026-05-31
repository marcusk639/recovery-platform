import { StyleSheet } from 'react-native';
import { fontSize, fontFamily, normalize } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: normalize(30),
  },
  header: {
    fontSize: fontSize.extraLarge,
    fontFamily: fontFamily.roboto,
  },
  verifyEmail: {
    fontSize: fontSize.large,
    fontFamily: fontFamily.roboto,
    textAlign: 'center',
  },
  newAccountForm: {},
  headerContainer: {
    marginBottom: normalize(30),
  },
  createAccountButton: {
    marginTop: normalize(50),
    marginBottom: normalize(50),
    height: normalize(45),
  },
});

export default styles;
