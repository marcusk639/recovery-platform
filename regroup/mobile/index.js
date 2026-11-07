/**
 * @format
 * @lint-ignore-every XPLATJSCOPYRIGHT1
 */

// Imported first so that firebase-setup (the e2e project check and, in an e2e
// emulator build, the emulator wiring) runs before any other module. The bare
// import matters: Metro's inlineRequires defers a named import to its first use.
import './firebase-setup';
import { emulatorConnection } from './firebase-setup';
import { ensureNotificationChannels } from './src/services/notifications/channels';

import { AppRegistry } from 'react-native';
import React from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import store from './src/state/store'; // New RTK store
import { queryClient } from './src/state/queryClient';
import App from './App';
import './i18n';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { navigationRef } from './src/navigation/service';
import { RatsKeyboardProvider } from './src/components/rats-keyboard';

// An e2e emulator build whose emulators do not answer must stop, not carry on.
// reportFatalError shows the red screen in debug and crashes a release build.
// In every other build emulatorConnection is already resolved.
emulatorConnection.catch((error) => {
  global.ErrorUtils.reportFatalError(error);
});

// Android channels for server pushes and rent reminders, created once at startup
// (after firebase-setup). Display and schedule paths await the same promise; it
// never rejects (failures are logged inside).
ensureNotificationChannels();

// Save the original method
// const originalCreateView = UIManager.createView;

// Override with a version that logs when pointerEvents is set
// Debugging function for pointerEvents=box-none issue on ios
// UIManager.createView = function (reactTag, viewName, rootTag, props) {
//   if (props && props.pointerEvents === 'box-none') {
//     console.log(
//       `pointerEvents=box-none set on ${viewName} with tag ${reactTag}`,
//     );
//     console.log('Component props:', JSON.stringify(props));
//     // console.trace();
//   }
//   return originalCreateView.apply(this, arguments);
// };

const root = () => (
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <NavigationContainer ref={navigationRef}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RatsKeyboardProvider>
            <App />
          </RatsKeyboardProvider>
        </GestureHandlerRootView>
      </NavigationContainer>
    </QueryClientProvider>
  </Provider>
);

// console.ignoredYellowBox = ['Warning: Each', 'Warning: Failed'];
console.ignoredYellowBox = true;

AppRegistry.registerComponent('rats', () => root);
