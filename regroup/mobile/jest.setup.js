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

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: mockNavigatorFactory,
  TransitionPresets: {},
  CardStyleInterpolators: {},
}));
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
  get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
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
  return { __esModule: true, default: fn, FirebaseAuthTypes: {} };
});

jest.mock('@react-native-firebase/firestore', () => {
  const docRef = {
    id: 'mock-doc-id',
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
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
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
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
  return { __esModule: true, default: () => mockFunctions };
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
  return { __esModule: true, default: fn };
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
  return { __esModule: true, default: () => mockAnalytics };
});

jest.mock('@react-native-firebase/crashlytics', () => {
  const mockCrashlytics = {
    log: jest.fn(),
    recordError: jest.fn(),
    setUserId: jest.fn(() => Promise.resolve()),
    setAttribute: jest.fn(() => Promise.resolve()),
    setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  };
  return { __esModule: true, default: () => mockCrashlytics };
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
  get: jest.fn(() => undefined),
  set: jest.fn(),
  watchKeys: jest.fn(() => 0),
  clearWatch: jest.fn(),
}));

// ─── misc native modules ─────────────────────────────────────────────────────
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome5', () => 'Icon');
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-vector-icons/AntDesign', () => 'Icon');
jest.mock('react-native-vector-icons/Feather', () => 'Icon');
jest.mock('react-native-vector-icons/Entypo', () => 'Icon');

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

jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  requestAuthorization: jest.fn(() => Promise.resolve('granted')),
}));

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
    requestAuthorization: jest.fn(),
  },
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(() => Promise.resolve({ assets: [] })),
  launchCamera: jest.fn(() => Promise.resolve({ assets: [] })),
}));

jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: {
    pick: jest.fn(() => Promise.resolve([])),
    pickSingle: jest.fn(() => Promise.resolve({})),
    types: { allFiles: 'public.item', pdf: 'com.adobe.pdf' },
    isCancel: jest.fn(() => false),
  },
  pick: jest.fn(() => Promise.resolve([])),
  types: { allFiles: 'public.item', pdf: 'com.adobe.pdf' },
  isCancel: jest.fn(() => false),
}));

jest.mock('react-native-fs', () => ({
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
  __esModule: true,
  default: { convert: jest.fn(() => Promise.resolve({ filePath: '/mock/file.pdf' })) },
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

jest.mock('react-native-modal-datetime-picker', () => {
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
    connectToEmulators: jest.fn(),
  }),
  { virtual: true },
);
