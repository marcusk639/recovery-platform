import { StyleSheet } from 'react-native';
import {
  fontSize,
  fontFamily,
  normalize,
  CARD_STYLE,
} from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
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
  newAccountForm: { ...CARD_STYLE, marginBottom: 0 },
  headerContainer: {
    marginBottom: normalize(30),
  },
  createAccountButton: {
    marginVertical: normalize(20),
    height: normalize(45),
  },
});

export default styles;
