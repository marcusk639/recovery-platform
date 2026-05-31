import { StyleSheet } from 'react-native';
import { normalize, color, fontFamily, fontSize } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    // paddingTop: normalize(50),
    flexGrow: 1,
    // alignItems: 'center',
  },
  viewContainer: {
    // flex: 1,
    // alignItems: 'center',
  },
  loginForm: {
    width: '85%',
    flex: 0.5,
  },
  error: {
    color: color.red,
    fontFamily: fontFamily.roboto,
    fontSize: fontSize.medium,
    // textAlign: 'center'
  },
  loginButton: {
    margin: 0,
    marginLeft: normalize(10),
    marginRight: normalize(10),
    marginBottom: normalize(10),
    padding: 0,
  },
});

const loginTextInputStyle = StyleSheet.create({
  textInput: {
    height: normalize(40),
    fontSize: fontSize.medium,
  },
});

export { styles, loginTextInputStyle };
