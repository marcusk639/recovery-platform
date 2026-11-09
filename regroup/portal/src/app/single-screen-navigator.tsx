import { createNavigatorFactory, StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { View } from 'react-native-web';

// A stack's history, for browser Back and reused screens' goBack, that mounts only
// the current screen. The phone's native stack would keep every visited screen
// mounted and listening, which a desktop session would pile up.
function SingleScreenNavigator({ id, initialRouteName, children, screenOptions, frame: Frame }: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
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
