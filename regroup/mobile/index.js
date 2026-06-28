/**
 * @format
 * @lint-ignore-every XPLATJSCOPYRIGHT1
 */

// Must run before any Firebase module is imported so useEmulator() fires first.
import { connectToEmulators } from './src/config/firebase-emulator';
connectToEmulators();

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
      <NavigationContainer
        ref={navigationRef}
        onStateChange={state => console.log('state', state)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <App />
        </GestureHandlerRootView>
      </NavigationContainer>
    </QueryClientProvider>
  </Provider>
);

// console.ignoredYellowBox = ['Warning: Each', 'Warning: Failed'];
console.ignoredYellowBox = true;

AppRegistry.registerComponent('rats', () => root);
