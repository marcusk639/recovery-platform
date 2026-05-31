import { CommonActions } from '@react-navigation/native';
import {
  AuthScreenNavigationProp,
  AuthStackParamList,
  Routes,
  SetupScreenNavigationProp,
} from './types';

type MainEntryNavigation = AuthScreenNavigationProp | SetupScreenNavigationProp;

/** Navigate to a sibling screen within the auth/setup stack. */
export function navigateAuthStackRoute(
  navigation: AuthScreenNavigationProp,
  route: keyof AuthStackParamList,
): void {
  switch (route) {
    case Routes.Signup:
      navigation.navigate(Routes.Signup, {});
      break;
    case Routes.InitialLanding:
      navigation.navigate(Routes.InitialLanding);
      break;
    case Routes.Login:
      navigation.navigate(Routes.Login);
      break;
    case Routes.NewAccount:
      navigation.navigate(Routes.NewAccount);
      break;
    case Routes.HouseSearch:
      navigation.navigate(Routes.HouseSearch);
      break;
    case Routes.ManagerIntro:
      navigation.navigate(Routes.ManagerIntro);
      break;
    case Routes.IntroHouseSummary:
      navigation.navigate(Routes.IntroHouseSummary);
      break;
    case Routes.OrgSetup:
      navigation.navigate(Routes.OrgSetup);
      break;
    case Routes.OperatorSetupWizard:
      navigation.navigate(Routes.OperatorSetupWizard);
      break;
  }
}

/** Enter the main app without forcing a tab (uses navigator default). */
export function navigateToMain(navigation: MainEntryNavigation): void {
  navigation.dispatch(CommonActions.navigate({ name: Routes.Main }));
}

/** Navigate from auth/setup flow into the main tab navigator on a specific tab. */
export function navigateToMainTab(
  navigation: MainEntryNavigation,
  tab: Routes.House | Routes.Guest,
): void {
  // Auth and setup composites both include RootStackParamList; cast avoids
  // incompatible navigate() overload unions between the two prop types.
  (navigation as AuthScreenNavigationProp).navigate(Routes.Main, { screen: tab });
}
