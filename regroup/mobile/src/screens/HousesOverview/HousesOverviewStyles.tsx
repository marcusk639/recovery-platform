import { StyleSheet } from 'react-native';
import { fontSize, normalize } from '../../styles/theme';

const houseOverviewStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: normalize(15),
  },
  info: {
    flex: 0.6,
    flexDirection: 'row',
  },
  summary: {
    flex: 0.4,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    flexDirection: 'row',
  },
  textStyle: {
    fontSize: fontSize.medium,
    alignSelf: 'center',
  },
});

export default houseOverviewStyles;
