import { StyleSheet } from 'react-native';
import { normalize, color } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    // justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    backgroundColor: color.light_grey,
  },
  row: {
    flexDirection: 'row',
    // justifyContent: 'space-between'
    // padding: normalize(12)
  },
  bottomRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  weeklyMarkers: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: normalize(5),
    paddingBottom: normalize(5),
  },
  fees: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  chore: {
    flex: 1,
    alignItems: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: normalize(15),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: normalize(4),
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
});

export default styles;
