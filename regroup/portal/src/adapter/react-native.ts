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

// Inside a reused screen, the width of its column rather than the window's
// (src/app/frame-width.tsx). Dimensions stays the window: modals size from it.
import { useWindowDimensions as useWebWindowDimensions } from 'react-native-web';
import { useFrameWidth } from '../app/frame-width';
export function useWindowDimensions() {
  const window = useWebWindowDimensions();
  const frame = useFrameWidth();
  return frame === null ? window : { ...window, width: frame };
}
