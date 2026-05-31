// Mock all @react-navigation packages to avoid BackHandler and native navigation issues
const mockNavigator = () => {
  const React = require('react');
  const {View} = require('react-native');
  const Navigator = ({children}) => React.createElement(View, null, children);
  const Screen = ({component: Component, ...props}) =>
    Component ? React.createElement(Component, props) : React.createElement(View);
  Navigator.Screen = Screen;
  Navigator.Group = ({children}) => React.createElement(React.Fragment, null, children);
  return {Navigator, Screen, Group: Navigator.Group};
};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({children}) => React.createElement(React.Fragment, null, children),
    useNavigation: jest.fn(() => ({navigate: jest.fn(), goBack: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn()})),
    useRoute: jest.fn(() => ({params: {}, name: 'MockRoute'})),
    useFocusEffect: jest.fn((cb) => cb()),
    useIsFocused: jest.fn(() => true),
    useNavigationState: jest.fn(() => null),
    CommonActions: {navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn()},
    StackActions: {push: jest.fn(), pop: jest.fn(), replace: jest.fn()},
    createNavigatorFactory: jest.fn(() => mockNavigator),
  };
});

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: mockNavigator,
  TransitionPresets: {},
  CardStyleInterpolators: {},
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: mockNavigator,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: mockNavigator,
}));

// Mock @react-native-firebase packages (native modules not available in Jest)
jest.mock('@react-native-firebase/app', () => ({
  default: {
    app: jest.fn(() => ({})),
    apps: [],
  },
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({user: {uid: 'test-uid'}})),
    signOut: jest.fn(() => Promise.resolve()),
    currentUser: null,
    createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({user: {uid: 'test-uid'}})),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
    signInWithCredential: jest.fn(() => Promise.resolve({user: {uid: 'test-uid'}})),
  };
  return () => mockAuth;
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockCollection = jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({exists: false, data: () => null})),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      onSnapshot: jest.fn(() => jest.fn()),
      collection: jest.fn(),
    })),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({docs: [], empty: true})),
    onSnapshot: jest.fn(() => jest.fn()),
    add: jest.fn(() => Promise.resolve({id: 'mock-id'})),
  }));
  const mockFirestore = {
    collection: mockCollection,
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({exists: false, data: () => null})),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      onSnapshot: jest.fn(() => jest.fn()),
      collection: mockCollection,
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
    runTransaction: jest.fn(() => Promise.resolve()),
    settings: jest.fn(),
    Timestamp: {
      now: jest.fn(() => ({toDate: () => new Date(), toMillis: () => Date.now()})),
      fromDate: jest.fn((d) => ({toDate: () => d, toMillis: () => d.getTime()})),
    },
    FieldValue: {
      serverTimestamp: jest.fn(() => ({})),
      arrayUnion: jest.fn((...args) => args),
      arrayRemove: jest.fn((...args) => args),
      increment: jest.fn((n) => n),
      delete: jest.fn(() => ({})),
    },
  };
  const fn = () => mockFirestore;
  fn.Timestamp = mockFirestore.Timestamp;
  fn.FieldValue = mockFirestore.FieldValue;
  return fn;
});

jest.mock('@react-native-firebase/functions', () => {
  const mockFunctions = {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({data: {}}))),
    useEmulator: jest.fn(),
  };
  return () => mockFunctions;
});

jest.mock('@react-native-firebase/messaging', () => {
  const mockMessaging = {
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    onMessage: jest.fn(() => jest.fn()),
    onNotificationOpenedApp: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    requestPermission: jest.fn(() => Promise.resolve(1)),
    hasPermission: jest.fn(() => Promise.resolve(1)),
    setBackgroundMessageHandler: jest.fn(),
    subscribeToTopic: jest.fn(() => Promise.resolve()),
    unsubscribeFromTopic: jest.fn(() => Promise.resolve()),
    AuthorizationStatus: {AUTHORIZED: 1, PROVISIONAL: 2, NOT_DETERMINED: -1, DENIED: 0},
  };
  return () => mockMessaging;
});

jest.mock('@react-native-firebase/storage', () => {
  const mockStorage = {
    ref: jest.fn(() => ({
      putFile: jest.fn(() => ({on: jest.fn(), then: jest.fn()})),
      getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file')),
      delete: jest.fn(() => Promise.resolve()),
    })),
  };
  return () => mockStorage;
});

jest.mock('@react-native-firebase/crashlytics', () => {
  const mockCrashlytics = {
    log: jest.fn(),
    recordError: jest.fn(),
    setUserId: jest.fn(() => Promise.resolve()),
    setAttribute: jest.fn(() => Promise.resolve()),
    setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  };
  return () => mockCrashlytics;
});

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock @react-native-community/netinfo
jest.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: jest.fn(() => Promise.resolve({isConnected: true, isInternetReachable: true})),
    addEventListener: jest.fn(() => jest.fn()),
  },
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({isConnected: true, isInternetReachable: true})),
}));

// Mock @stripe/stripe-react-native
jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({children}) => children,
  useStripe: jest.fn(() => ({
    initPaymentSheet: jest.fn(() => Promise.resolve({error: null})),
    presentPaymentSheet: jest.fn(() => Promise.resolve({error: null})),
    confirmPayment: jest.fn(() => Promise.resolve({error: null})),
  })),
  initStripe: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-fast-image
jest.mock('react-native-fast-image', () => {
  const React = require('react');
  const {Image} = require('react-native');
  const FastImage = React.forwardRef((props, ref) => React.createElement(Image, {...props, ref}));
  FastImage.resizeMode = {contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center'};
  FastImage.priority = {low: 'low', normal: 'normal', high: 'high'};
  FastImage.cacheControl = {immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly'};
  FastImage.preload = jest.fn();
  return FastImage;
});

// Mock react-native-flash-message
jest.mock('react-native-flash-message', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    default: () => React.createElement(View),
    showMessage: jest.fn(),
    hideMessage: jest.fn(),
  };
});

// Mock social auth packages
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({idToken: 'mock-token'})),
    signOut: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
    getTokens: jest.fn(() => Promise.resolve({accessToken: 'mock-access', idToken: 'mock-id'})),
  },
  statusCodes: {SIGN_IN_CANCELLED: 0, IN_PROGRESS: 1, PLAY_SERVICES_NOT_AVAILABLE: 2, SIGN_IN_REQUIRED: 3},
}));

jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    performRequest: jest.fn(() => Promise.resolve({identityToken: 'mock-token', nonce: 'mock-nonce'})),
    onCredentialRevoked: jest.fn(() => jest.fn()),
    isSupported: true,
    AppleAuthRequestOperation: {LOGIN: 0},
    AppleAuthRequestScope: {FULL_NAME: 0, EMAIL: 1},
  },
}));

jest.mock('react-native-fbsdk-next', () => ({
  LoginManager: {
    logInWithPermissions: jest.fn(() => Promise.resolve({isCancelled: false})),
    logOut: jest.fn(),
  },
  AccessToken: {
    getCurrentAccessToken: jest.fn(() => Promise.resolve({accessToken: 'mock-fb-token'})),
  },
  GraphRequest: jest.fn(),
  GraphRequestManager: jest.fn(() => ({addRequest: jest.fn().mockReturnThis(), start: jest.fn()})),
}));

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const {View} = require('react-native');
  const WebView = React.forwardRef((props, ref) => React.createElement(View, {...props, ref}));
  return {WebView, default: WebView};
});

// Mock clipboard packages
jest.mock('@react-native-clipboard/clipboard', () => ({
  default: {getString: jest.fn(() => Promise.resolve('')), setString: jest.fn()},
}));
jest.mock('@react-native-community/clipboard', () => ({
  default: {getString: jest.fn(() => Promise.resolve('')), setString: jest.fn()},
}));

// Mock date/time picker packages
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {default: (props) => React.createElement(View, props)};
});
jest.mock('react-native-modal-datetime-picker', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {default: (props) => React.createElement(View, props)};
});

// Mock geolocation and slider
jest.mock('@react-native-community/geolocation', () => ({
  default: {getCurrentPosition: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn()},
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
}));
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {default: React.forwardRef((props, ref) => React.createElement(View, {...props, ref}))};
});

// Mock picker
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const {View} = require('react-native');
  const Picker = (props) => React.createElement(View, props);
  Picker.Item = (props) => React.createElement(View, props);
  return {Picker, default: Picker};
});

// Mock react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(() => Promise.resolve({assets: []})),
  launchCamera: jest.fn(() => Promise.resolve({assets: []})),
  ImageLibraryOptions: {},
  CameraOptions: {},
}));

// Mock react-native-document-picker
jest.mock('react-native-document-picker', () => ({
  default: {pick: jest.fn(() => Promise.resolve([{uri: 'mock://file.pdf', name: 'file.pdf', type: 'application/pdf'}]))},
  pick: jest.fn(() => Promise.resolve([{uri: 'mock://file.pdf', name: 'file.pdf', type: 'application/pdf'}])),
  isCancel: jest.fn(() => false),
  types: {pdf: 'application/pdf', images: 'image/*', allFiles: '*/*'},
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const React = require('react');
  const {View} = require('react-native');
  const MapView = React.forwardRef((props, ref) => React.createElement(View, {...props, ref}));
  MapView.Marker = (props) => React.createElement(View, props);
  MapView.Callout = (props) => React.createElement(View, props);
  return {default: MapView, Marker: MapView.Marker, Callout: MapView.Callout};
});

// Mock react-native-google-places-autocomplete
jest.mock('react-native-google-places-autocomplete', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    GooglePlacesAutocomplete: React.forwardRef((props, ref) => React.createElement(View, {...props, ref})),
  };
});

// Mock react-native-permissions
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {IOS: {CAMERA: 'ios.permission.CAMERA', PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY'}, ANDROID: {}},
  RESULTS: {GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable'},
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
}));
