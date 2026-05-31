import { StyleSheet } from 'react-native';
import { normalize } from '../../styles/theme';

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  fieldContainer: {
    //  flex: 0.5,
    width: '90%',
    alignItems: 'center',
  },
  buttonContainer: {
    width: '85%',
  },
  waitingContainer: {
    flex: 1,
    alignItems: 'center',
  },
});

export default modalStyles;
