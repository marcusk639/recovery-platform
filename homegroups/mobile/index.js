/**
 * @format
 */

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
