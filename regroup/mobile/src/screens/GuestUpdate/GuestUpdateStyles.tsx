import { StyleSheet } from 'react-native';
import { normalize, color } from '../../styles/theme';

const styles = StyleSheet.create({
  form: {
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  formStyles: {
    color: color.black,
    fontSize: normalize(20),
    textAlign: 'center',
    width: '100%',
  },
  formContainer: {
    alignContent: 'flex-start',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  succeeded: {
    color: color.green,
    textAlign: 'center',
  },
  failed: {
    color: color.red,
    textAlign: 'center',
  },
  textInput: {
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
  },
});

export default styles;
