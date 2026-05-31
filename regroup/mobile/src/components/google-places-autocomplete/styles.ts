import { normalize, fontSize, color, fontFamily } from '../../styles/theme';

const autocompleteStyles = {
  container: {
    position: 'relative',
  },
  textInputContainer: {
    width: '100%',
    height: normalize(50),
    padding: normalize(5),
    position: 'relative',
    // backgroundColor: color.light_black
  },
  description: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.regular_medium,
    // color: color.grey
  },
  predefinedPlacesDescription: {
    color: '#1faadb',
  },
  textInput: {
    flex: 1,
    fontSize: fontSize.regular_medium,
    paddingTop: normalize(2),
    // color: color.black
    // backgroundColor: color.black
  },
  row: {
    flex: 1,
  },
};

export default autocompleteStyles;
