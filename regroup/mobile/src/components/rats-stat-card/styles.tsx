import { StyleSheet } from 'react-native';
import { fontSize, color, normalize, fontFamily } from '../../styles/theme';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  statFooterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statFooter: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
  statFooterItem: {
    flexDirection: 'row',
  },
  statHeaderItem: {
    justifyContent: 'center',
    borderRightColor: color.grey,
    borderRightWidth: 2,
    marginRight: normalize(10),
  },
  statContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    flex: 0.07,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  statHeaderContainer: {
    flexDirection: 'row',
  },
  statHeader: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    marginRight: normalize(10),
  },
  statNumber: {
    fontSize: fontSize.huge,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
  },
  statDescription: {
    color: color.dark_grey,
  },
  statsContainer: {
    flex: 0.5,
    marginTop: normalize(10),
    marginBottom: normalize(10),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateHeader: {
    flex: 0.05,
  },
  health: {
    justifyContent: 'space-between',
    //  flex: 1,
    flexDirection: 'row',
  },
  cardsContainer: {
    flex: 0.09,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  card: {
    width: '25%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    // ...elevateStyle
  },
  cardText: {
    fontSize: fontSize.large,
    color: color.black,
  },
  cardElementContainer: { width: '30%', height: '60%' },
  name: {
    fontSize: fontSize.extraLarge,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  overallPercentage: {
    color: color.red,
    fontSize: fontSize.extraLarge,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});

export default styles;
