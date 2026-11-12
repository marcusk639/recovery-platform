export * from 'react-native-web';
export { Alert } from './alert/alert-store';
export { Share } from './share';

// On a phone the screen is the window. On a desktop it's the whole monitor, so
// screens that size themselves from Dimensions.get('screen') come out too big.
import { Dimensions as WebDimensions } from 'react-native-web';
export const Dimensions = {
  ...WebDimensions,
  get: (dim: 'window' | 'screen') => WebDimensions.get(dim === 'screen' ? 'window' : dim),
  addEventListener: WebDimensions.addEventListener.bind(WebDimensions),
};
