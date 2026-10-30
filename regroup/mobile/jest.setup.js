/* eslint-disable no-undef */
/**
 * Global Jest setup for unit tests (loaded via jest.config.js setupFiles).
 *
 * Mocks every native module the app imports so tests never touch real
 * native code or Firebase. Individual tests can still override any of
 * these with their own jest.mock(...) factories.
 */

// ─── react-native-safe-area-context ─────────────────────────────────────────
// Hand-rolled mock: the package's official jest mock pulls in its
// TurboModule spec, which crashes under RN 0.72's Jest environment.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MOCK_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
  const MOCK_FRAME = { x: 0, y: 0, width: 320, height: 640 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
    SafeAreaInsetsContext: React.createContext(MOCK_INSETS),
    SafeAreaFrameContext: React.createContext(MOCK_FRAME),
    useSafeAreaInsets: () => MOCK_INSETS,
    useSafeAreaFrame: () => MOCK_FRAME,
    initialWindowMetrics: { insets: MOCK_INSETS, frame: MOCK_FRAME },
  };
});

// ─── react-native-screens / gesture-handler ─────────────────────────────────
jest.mock('react-native-screens', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }) => React.createElement(View, props, children);
  return {
    enableScreens: jest.fn(),
    enableFreeze: jest.fn(),
    screensEnabled: jest.fn(() => true),
    Screen: passthrough,
    ScreenContainer: passthrough,
    ScreenStack: passthrough,
    FullWindowOverlay: passthrough,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const RN = require('react-native');
  const passthrough = ({ children, ...props }) => React.createElement(RN.View, props, children);
  return {
    GestureHandlerRootView: passthrough,
    PanGestureHandler: passthrough,
    TapGestureHandler: passthrough,
    LongPressGestureHandler: passthrough,
    State: {},
    Directions: {},
    gestureHandlerRootHOC: (c) => c,
    Swipeable: passthrough,
    DrawerLayout: passthrough,
    TouchableOpacity: RN.TouchableOpacity,
    TouchableHighlight: RN.TouchableHighlight,
    TouchableWithoutFeedback: RN.TouchableWithoutFeedback,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    TextInput: RN.TextInput,
  };
});

// ─── @react-navigation ───────────────────────────────────────────────────────
const mockNavigatorFactory = () => {
  const React = require('react');
  const { View } = require('react-native');
  const Navigator = ({ children }) => React.createElement(View, null, children);
  const Screen = ({ component: Component, ...props }) =>
    Component ? React.createElement(Component, props) : React.createElement(View);
  Navigator.Screen = Screen;
  Navigator.Group = ({ children }) => React.createElement(React.Fragment, null, children);
  return { Navigator, Screen, Group: Navigator.Group };
};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  // Real action creators — tests assert on the action objects that
  // navigation.dispatch receives (e.g. authNavigation.test.ts).
  const { CommonActions, StackActions } = jest.requireActual('@react-navigation/routers');
  return {
    NavigationContainer: ({ children }) => React.createElement(React.Fragment, null, children),
    useNavigation: jest.fn(() => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      popToTop: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      setParams: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      removeListener: jest.fn(),
      canGoBack: jest.fn(() => true),
      isFocused: jest.fn(() => true),
      getParent: jest.fn(),
      getState: jest.fn(() => ({ routes: [] })),
      reset: jest.fn(),
      replace: jest.fn(),
    })),
    useRoute: jest.fn(() => ({ params: {}, name: 'MockRoute', key: 'mock' })),
    useFocusEffect: jest.fn((cb) => cb()),
    useIsFocused: jest.fn(() => true),
    useNavigationState: jest.fn(() => null),
    CommonActions,
    StackActions,
    createNavigatorFactory: jest.fn(() => mockNavigatorFactory),
    DefaultTheme: { colors: {} },
    DarkTheme: { colors: {} },
    useTheme: jest.fn(() => ({ colors: {} })),
  };
});

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: mockNavigatorFactory,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: mockNavigatorFactory,
}));

// ─── @react-native-firebase/* ────────────────────────────────────────────────
// Global stubs (collection/doc/get/set/onSnapshot etc.). Most tests go
// through the firebase-setup manual mock instead; these cover direct
// imports of the RNFirebase packages.
const mockFirestoreDocRef = () => ({
  id: 'mock-doc-id',
  get: jest.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  onSnapshot: jest.fn(() => jest.fn()),
  collection: jest.fn(() => mockFirestoreCollectionRef()),
});
const mockFirestoreCollectionRef = () => {
  const ref = {
    doc: jest.fn(() => mockFirestoreDocRef()),
    get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
    add: jest.fn(() => Promise.resolve(mockFirestoreDocRef())),
    onSnapshot: jest.fn(() => jest.fn()),
  };
  ref.where = jest.fn(() => ref);
  ref.orderBy = jest.fn(() => ref);
  ref.limit = jest.fn(() => ref);
  ref.startAfter = jest.fn(() => ref);
  ref.endBefore = jest.fn(() => ref);
  return ref;
};

jest.mock('@react-native-firebase/app', () => ({
  default: { app: jest.fn(() => ({})), apps: [] },
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: jest.fn(() => jest.fn()),
    onIdTokenChanged: jest.fn(() => jest.fn()),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
    createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
    signInAnonymously: jest.fn(() => Promise.resolve({ user: { uid: 'anon-uid' } })),
    signOut: jest.fn(() => Promise.resolve()),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
    useEmulator: jest.fn(),
  };
  const fn = () => mockAuth;
  fn.FirebaseAuthTypes = {};
  return {
    __esModule: true,
    default: fn,
    FirebaseAuthTypes: {},
    // Modular forms over the instance (or user) passed in, so suites that
    // configure auth() keep driving the same object.
    getAuth: () => mockAuth,
    connectAuthEmulator: jest.fn(),
    onAuthStateChanged: (a, ...args) => a.onAuthStateChanged(...args),
    onIdTokenChanged: (a, ...args) => a.onIdTokenChanged(...args),
    signInWithEmailAndPassword: (a, ...args) => a.signInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (a, ...args) => a.createUserWithEmailAndPassword(...args),
    signInAnonymously: (a) => a.signInAnonymously(),
    signOut: (a) => a.signOut(),
    sendPasswordResetEmail: (a, ...args) => a.sendPasswordResetEmail(...args),
    getIdToken: (user, ...args) => user.getIdToken(...args),
    getIdTokenResult: (user, ...args) => user.getIdTokenResult(...args),
    linkWithCredential: (user, ...args) => user.linkWithCredential(...args),
    reauthenticateWithCredential: (user, ...args) => user.reauthenticateWithCredential(...args),
    reload: (user) => user.reload(),
    updateProfile: (user, ...args) => user.updateProfile(...args),
    signInWithPhoneNumber: (a, ...args) => a.signInWithPhoneNumber(...args),
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const docRef = {
    id: 'mock-doc-id',
    get: jest.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
    onSnapshot: jest.fn(() => jest.fn()),
  };
  const collectionRef = {
    doc: jest.fn(() => docRef),
    get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
    add: jest.fn(() => Promise.resolve(docRef)),
    onSnapshot: jest.fn(() => jest.fn()),
  };
  collectionRef.where = jest.fn(() => collectionRef);
  collectionRef.orderBy = jest.fn(() => collectionRef);
  collectionRef.limit = jest.fn(() => collectionRef);
  docRef.collection = jest.fn(() => collectionRef);
  const Timestamp = {
    now: jest.fn(() => ({
      toDate: () => new Date(),
      toMillis: () => Date.now(),
    })),
    fromDate: jest.fn((d) => ({
      toDate: () => d,
      toMillis: () => d.getTime(),
    })),
  };
  const FieldValue = {
    serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
    arrayUnion: jest.fn((...args) => args),
    arrayRemove: jest.fn((...args) => args),
    increment: jest.fn((n) => n),
    delete: jest.fn(() => ({ __delete: true })),
  };
  const FieldPath = { documentId: jest.fn(() => '__documentId__') };
  const mockFirestore = {
    collection: jest.fn(() => collectionRef),
    collectionGroup: jest.fn(() => collectionRef),
    doc: jest.fn(() => docRef),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
    runTransaction: jest.fn((fn) =>
      fn({
        get: jest.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      }),
    ),
    settings: jest.fn(),
    useEmulator: jest.fn(),
    Timestamp,
    FieldValue,
    FieldPath,
  };
  const fn = () => mockFirestore;
  fn.Timestamp = Timestamp;
  fn.FieldValue = FieldValue;
  fn.FieldPath = FieldPath;
  return {
    __esModule: true,
    default: fn,
    ...require('./__mocks__/firebase-modular/namespaced-adapter'),
    // Modular FieldValue helpers, backed by the same jest.fns as FieldValue.
    serverTimestamp: (...args) => FieldValue.serverTimestamp(...args),
    increment: (...args) => FieldValue.increment(...args),
    arrayUnion: (...args) => FieldValue.arrayUnion(...args),
    arrayRemove: (...args) => FieldValue.arrayRemove(...args),
    deleteField: () => FieldValue.delete(),
    getFirestore: () => mockFirestore,
    initializeFirestore: jest.fn(() => Promise.resolve(mockFirestore)),
    connectFirestoreEmulator: jest.fn(),
    Timestamp,
    FieldValue,
    FieldPath,
    FirebaseFirestoreTypes: {},
  };
});

jest.mock('@react-native-firebase/functions', () => {
  const mockFunctions = {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
    useEmulator: jest.fn(),
  };
  return {
    __esModule: true,
    default: () => mockFunctions,
    getFunctions: () => mockFunctions,
    // Modular form over whatever functions instance the caller passes (often
    // a suite's own firebase-setup mock), as namespaced-adapter does for Firestore.
    httpsCallable: (instance, ...args) => instance.httpsCallable(...args),
    connectFunctionsEmulator: jest.fn(),
  };
});

jest.mock('@react-native-firebase/messaging', () => {
  const mockMessaging = {
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    deleteToken: jest.fn(() => Promise.resolve()),
    onMessage: jest.fn(() => jest.fn()),
    onTokenRefresh: jest.fn(() => jest.fn()),
    onNotificationOpenedApp: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    requestPermission: jest.fn(() => Promise.resolve(1)),
    hasPermission: jest.fn(() => Promise.resolve(1)),
    setBackgroundMessageHandler: jest.fn(),
    subscribeToTopic: jest.fn(() => Promise.resolve()),
    unsubscribeFromTopic: jest.fn(() => Promise.resolve()),
  };
  const fn = () => mockMessaging;
  fn.AuthorizationStatus = {
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    NOT_DETERMINED: -1,
    DENIED: 0,
  };
  return {
    __esModule: true,
    default: fn,
    AuthorizationStatus: fn.AuthorizationStatus,
    // Modular forms over the instance passed in.
    getMessaging: () => mockMessaging,
    getToken: (m, ...args) => m.getToken(...args),
    deleteToken: (m, ...args) => m.deleteToken(...args),
    requestPermission: (m, ...args) => m.requestPermission(...args),
    hasPermission: (m) => m.hasPermission(),
    onMessage: (m, ...args) => m.onMessage(...args),
    onTokenRefresh: (m, ...args) => m.onTokenRefresh(...args),
    onNotificationOpenedApp: (m, ...args) => m.onNotificationOpenedApp(...args),
    getInitialNotification: (m) => m.getInitialNotification(),
    setBackgroundMessageHandler: (m, ...args) => m.setBackgroundMessageHandler(...args),
    subscribeToTopic: (m, ...args) => m.subscribeToTopic(...args),
    unsubscribeFromTopic: (m, ...args) => m.unsubscribeFromTopic(...args),
  };
});

jest.mock('@react-native-firebase/storage', () => {
  const mockStorage = {
    ref: jest.fn(() => ({
      putFile: jest.fn(() => Promise.resolve()),
      putString: jest.fn(() => Promise.resolve()),
      getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file')),
      delete: jest.fn(() => Promise.resolve()),
    })),
    useEmulator: jest.fn(),
  };
  return {
    __esModule: true,
    default: () => mockStorage,
    FirebaseStorageTypes: {},
    // Modular forms over the instance or ref passed in.
    getStorage: () => mockStorage,
    connectStorageEmulator: jest.fn(),
    ref: (s, ...args) => s.ref(...args),
    putFile: (r, ...args) => r.putFile(...args),
    putString: (r, ...args) => r.putString(...args),
    getDownloadURL: (r) => r.getDownloadURL(),
    deleteObject: (r) => r.delete(),
  };
});

jest.mock('@react-native-firebase/analytics', () => {
  const mockAnalytics = {
    logEvent: jest.fn(() => Promise.resolve()),
    logScreenView: jest.fn(() => Promise.resolve()),
    setUserId: jest.fn(() => Promise.resolve()),
    setUserProperty: jest.fn(() => Promise.resolve()),
    setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    default: () => mockAnalytics,
    getAnalytics: () => mockAnalytics,
    logEvent: (a, ...args) => a.logEvent(...args),
    logScreenView: (a, ...args) => a.logScreenView(...args),
    setUserId: (a, ...args) => a.setUserId(...args),
    setUserProperty: (a, ...args) => a.setUserProperty(...args),
    setAnalyticsCollectionEnabled: (a, ...args) => a.setAnalyticsCollectionEnabled(...args),
  };
});

// ─── notifications ───────────────────────────────────────────────────────────
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(() => Promise.resolve({ authorizationStatus: 1 })),
    createChannel: jest.fn(() => Promise.resolve('channel-id')),
    displayNotification: jest.fn(() => Promise.resolve('notification-id')),
    cancelNotification: jest.fn(() => Promise.resolve()),
    cancelAllNotifications: jest.fn(() => Promise.resolve()),
    onForegroundEvent: jest.fn(() => jest.fn()),
    onBackgroundEvent: jest.fn(),
    createTriggerNotification: jest.fn(() => Promise.resolve('trigger-id')),
    getTriggerNotifications: jest.fn(() => Promise.resolve([])),
    setBadgeCount: jest.fn(() => Promise.resolve()),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 },
  AuthorizationStatus: { AUTHORIZED: 1, DENIED: 0, NOT_DETERMINED: -1 },
  EventType: { PRESS: 1, DISMISSED: 0, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
}));

jest.mock('react-native-push-notification', () => ({
  configure: jest.fn(),
  localNotification: jest.fn(),
  localNotificationSchedule: jest.fn(),
  cancelAllLocalNotifications: jest.fn(),
  cancelLocalNotification: jest.fn(),
  createChannel: jest.fn(),
  requestPermissions: jest.fn(() => Promise.resolve({ alert: true })),
  setApplicationIconBadgeNumber: jest.fn(),
  getScheduledLocalNotifications: jest.fn((cb) => cb([])),
}));

jest.mock('@react-native-community/push-notification-ios', () => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  requestPermissions: jest.fn(() => Promise.resolve({ alert: true })),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  setApplicationIconBadgeNumber: jest.fn(),
  FetchResult: { NoData: 'noData' },
}));

// ─── react-native core modules without Jest defaults ────────────────────────
// RN's Settings module requires the native SettingsManager TurboModule,
// which does not exist in the Jest environment (used by src/util/e2e.ts).
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  // RN 0.88's root export reads this module's default export.
  __esModule: true,
  default: {
    get: jest.fn(() => undefined),
    set: jest.fn(),
    watchKeys: jest.fn(() => 0),
    clearWatch: jest.fn(),
  },
}));

// ─── misc native modules ─────────────────────────────────────────────────────
// The app imports the three icon families' static entries (no Expo dynamic font loading);
// FontAwesome5 goes through src/components/rats-icon/font-awesome-5.
jest.mock('@react-native-vector-icons/fontawesome5/static', () => 'Icon');
jest.mock('@react-native-vector-icons/ionicons/static', () => 'Icon');
jest.mock('@react-native-vector-icons/material-icons/static', () => 'Icon');

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  wrap: (c) => c,
  ReactNavigationInstrumentation: jest.fn(),
  ReactNativeTracing: jest.fn(),
  withScope: jest.fn((cb) => cb({ setExtra: jest.fn(), setTag: jest.fn() })),
}));

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }) => children,
  useStripe: jest.fn(() => ({
    initPaymentSheet: jest.fn(() => Promise.resolve({ error: null })),
    presentPaymentSheet: jest.fn(() => Promise.resolve({ error: null })),
    confirmPayment: jest.fn(() => Promise.resolve({ error: null })),
    createPaymentMethod: jest.fn(() => Promise.resolve({ error: null })),
  })),
  initStripe: jest.fn(() => Promise.resolve()),
  CardField: () => null,
}));

jest.mock('react-native-permissions', () => ({
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
  checkMultiple: jest.fn(() => Promise.resolve({})),
  requestMultiple: jest.fn(() => Promise.resolve({})),
  checkNotifications: jest.fn(() => Promise.resolve({ status: 'granted', settings: {} })),
  requestNotifications: jest.fn(() => Promise.resolve({ status: 'granted', settings: {} })),
  openSettings: jest.fn(() => Promise.resolve()),
  PERMISSIONS: { IOS: {}, ANDROID: {} },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    UNAVAILABLE: 'unavailable',
  },
}));

jest.mock('@react-native-community/geolocation', () => {
  const Geolocation = {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
    requestAuthorization: jest.fn(),
    setRNConfiguration: jest.fn(),
  };
  return { __esModule: true, default: Geolocation, ...Geolocation };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(() => Promise.resolve({ assets: [] })),
  launchCamera: jest.fn(() => Promise.resolve({ assets: [] })),
}));

// The picker's errorCodes / isErrorWithCode are its real ones (pure JS); its package root loads
// the TurboModule, so the file is required by path (its exports map hides the deep path).
jest.mock('@react-native-documents/picker', () => {
  const path = require('path');
  const errors = jest.requireActual(
    path.join(path.dirname(require.resolve('@react-native-documents/picker/package.json')), 'lib/module/errors.js'),
  );
  return {
    pick: jest.fn(() => Promise.resolve([])),
    keepLocalCopy: jest.fn(({ files }) =>
      Promise.resolve(
        files.map((f) => ({ status: 'success', sourceUri: f.uri, localUri: `file:///mock/caches/${f.fileName}` })),
      ),
    ),
    types: {
      allFiles: '*/*',
      csv: ['text/csv', 'text/comma-separated-values'],
      images: 'image/*',
      pdf: 'application/pdf',
      plainText: 'text/plain',
    },
    errorCodes: errors.errorCodes,
    isErrorWithCode: errors.isErrorWithCode,
  };
});

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  TemporaryDirectoryPath: '/mock/tmp',
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(false)),
  unlink: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
}));

jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn(() => Promise.resolve({ filePath: '/mock/file.pdf' })),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { getString: jest.fn(() => Promise.resolve('')), setString: jest.fn() },
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props) => React.createElement(View, props) };
});

jest.mock('react-native-date-picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props) => React.createElement(View, props) };
});

jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Picker = (props) => React.createElement(View, props);
  Picker.Item = (props) => React.createElement(View, props);
  return { Picker, default: Picker };
});

jest.mock('react-native-keyboard-manager', () => ({
  setEnable: jest.fn(),
  setEnableAutoToolbar: jest.fn(),
  setToolbarPreviousNextButtonEnable: jest.fn(),
  setKeyboardDistanceFromTextField: jest.fn(),
  setShouldResignOnTouchOutside: jest.fn(),
}));

// KeyboardAwareHOC reads Platform.constants.reactNativeVersion.major, which
// is undefined in the Jest RN environment — mock with plain ScrollView.
jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const React = require('react');
  const { ScrollView, FlatList } = require('react-native');
  return {
    KeyboardAwareScrollView: React.forwardRef((props, ref) =>
      React.createElement(ScrollView, { ...props, ref }),
    ),
    KeyboardAwareFlatList: React.forwardRef((props, ref) =>
      React.createElement(FlatList, { ...props, ref }),
    ),
    listenToKeyboardEvents: (c) => c,
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  return { WebView, default: WebView };
});

// ─── firebase-setup consumers occasionally need this too ────────────────────
jest.mock(
  './src/config/firebase-emulator',
  () => ({
    connectToEmulators: jest.fn(() => Promise.resolve()),
    emulatorHost: jest.fn(() => '127.0.0.1'),
    emulatorPorts: jest.fn(() => ({ auth: 9099, firestore: 8080, storage: 9199, functions: 5001 })),
    E2EEmulatorUnreachable: class E2EEmulatorUnreachable extends Error {},
  }),
  { virtual: true },
);

// Native module: its JS proxy throws on any access when the module is not linked.
jest.mock('react-native-launch-arguments', () => ({
  LaunchArguments: { value: jest.fn(() => ({})) },
}));

