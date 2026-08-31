/**
 * @format
 */

// Polyfill TextEncoder/TextDecoder BEFORE anything else. The RN 0.72 runtime (JSC, Hermes
// disabled) does not provide them, and react-native-qrcode-svg (via the `qrcode` lib's
// byte-data encoder) needs TextEncoder. Without this the Meeting QR-code screen render-crashes
// with "Can't find variable: TextEncoder" — the QR check-in feature is unusable. (`text-encoding`
// is already in node_modules.)
import {TextEncoder, TextDecoder} from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';

// Set up background message handler (must be done outside of React component lifecycle)
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background notification received:', remoteMessage);
  // Background notifications are handled automatically by FCM
  // This handler is for any additional background processing if needed
});

console.log('AppRegistry', AppRegistry);
AppRegistry.registerComponent(appName, () => App);
