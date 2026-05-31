import { StyleSheet } from 'react-native';
import { fontSize, normalize, color } from '../../styles/theme';

const summaryListItemStyles = StyleSheet.create({
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
  descriptionStyle: {
    fontSize: fontSize.medium,
    alignSelf: 'center',
    color: color.grey,
  },
  notifications: {
    alignItems: 'center',
    justifyContent: 'center',
    width: normalize(25),
    height: normalize(25),
  },
});

export default summaryListItemStyles;
