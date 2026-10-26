import { Platform, Settings } from 'react-native';
import { isE2EBuild } from '../config/env';

/**
 * True when a debug build was launched by the Maestro harness with the
 * IS_E2E_TEST argument (the existing flows in maestro/ pass it).
 *
 * On iOS, AppDelegate detects the IS_E2E_TEST launch argument and writes it to
 * NSUserDefaults, which the React Native `Settings` module reads here. Gated on
 * `__DEV__` so a release build can never flip E2E-only behavior from a launch
 * argument or a persisted default; release e2e builds use the bundled variant.
 */
const launchedWithE2EFlagInDebug = (): boolean => {
  if (!__DEV__ || Platform.OS !== 'ios') {
    return false;
  }
  const flag = Settings.get('IS_E2E_TEST');
  return flag === true || flag === 1 || flag === '1';
};

/**
 * Whether to relax UI that is hostile to automation — e.g. disabling
 * `secureTextEntry` on the login password field so Maestro can type into it
 * (XCUITest cannot focus/type secure fields reliably on recent iOS runtimes).
 *
 * True for a bundle built as an e2e variant (isE2EBuild, a bundle-time value),
 * or for a debug build launched with IS_E2E_TEST. Never for a store build.
 */
export const relaxUiForE2E = (): boolean => isE2EBuild() || launchedWithE2EFlagInDebug();
