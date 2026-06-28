import { Platform, Settings } from 'react-native';

/**
 * True only when the app was launched by the E2E harness (Maestro / Detox).
 *
 * On iOS, AppDelegate detects the IS_E2E_TEST launch argument and writes it to
 * NSUserDefaults, which the React Native `Settings` module reads here. Gated on
 * `__DEV__` so a production build can never flip E2E-only behavior, regardless
 * of any persisted default.
 *
 * Use this to relax UI that is hostile to automation — e.g. disabling
 * `secureTextEntry` on the login password field so Maestro can type into it
 * (XCUITest cannot focus/type secure fields reliably on recent iOS runtimes).
 */
const e2eFlag = Platform.OS === 'ios' ? Settings.get('IS_E2E_TEST') : undefined;

export const IS_E2E_TEST: boolean =
  __DEV__ && (e2eFlag === true || e2eFlag === 1 || e2eFlag === '1');

// TEMP DIAGNOSTIC — remove after verifying E2E flag wiring.
console.log(
  `[E2E-DIAG] platform=${Platform.OS} rawFlag=${JSON.stringify(
    e2eFlag,
  )} type=${typeof e2eFlag} __DEV__=${__DEV__} IS_E2E_TEST=${IS_E2E_TEST}`,
);
