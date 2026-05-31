import { StyleSheet, ViewStyle } from 'react-native';
import { color, normalize, fontSize, elevateStyle } from '../../styles/theme';

const dayStyle: ViewStyle = {
  width: normalize(35),
  height: normalize(35),
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: normalize(5),
  marginBottom: normalize(5),
};

const weekdayStyles = StyleSheet.create({
  weekdaysDescription: {
    color: color.dark_grey,
    fontSize: fontSize.medium,
  },
  weekdaysContainer: {
    flex: 1,
    ...elevateStyle,
    backgroundColor: color.white,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  weekdays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pastDay: {
    ...dayStyle,
    backgroundColor: color.grey,
  },
  presentDay: {
    ...dayStyle,
    backgroundColor: color.white,
    borderWidth: 2,
  },
  futureDay: {
    ...dayStyle,
    backgroundColor: color.white,
    borderColor: color.grey,
    borderWidth: 2,
  },
  activeDay: {
    ...dayStyle,
  },
});

export default weekdayStyles;
