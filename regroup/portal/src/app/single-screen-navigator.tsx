import { CommonActions, createNavigatorFactory, StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { View } from 'react-native-web';
import store from '@mobile/state/store';
import { parentOf, withRouteContext } from './route-context';

function PortalRouter(options: any) {
  const router = StackRouter(options);
  return {
    ...router,
    getStateForAction(state: any, action: any, config: any) {
      const selectedGuestId = store.getState().guests.selectedGuestId ?? null;
      const next = router.getStateForAction(state, withRouteContext(state, action, selectedGuestId), config);
      if (next !== null || action.type !== 'GO_BACK') return next;
      // Nothing behind a page opened by URL or reload. Unhandled, this would reach
      // onUnhandledAction, and a back arrow would say the screen isn't available.
      const parent = parentOf(state.routes[state.index]);
      if (!parent) return state;
      return router.getStateForAction(state, CommonActions.navigate(parent.name, parent.params), config);
    },
  };
}

// A stack's history, for browser Back and reused screens' goBack, that mounts only
// the current screen. The phone's native stack would keep every visited screen
// mounted and listening, which a desktop session would pile up.
function SingleScreenNavigator({ id, initialRouteName, children, screenOptions, frame: Frame }: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(PortalRouter as any, {
    id,
    initialRouteName,
    children,
    screenOptions,
  });
  const focused = state.routes[state.index];
  return (
    <NavigationContent>
      <View style={{ flex: 1 }}>
        <Frame state={state} routeKey={focused.key}>
          {descriptors[focused.key].render()}
        </Frame>
      </View>
    </NavigationContent>
  );
}

export const createSingleScreenNavigator = createNavigatorFactory(SingleScreenNavigator);
