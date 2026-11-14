/** Dual-shape @react-native-firebase/messaging mock (not part of the operation log). */
const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  EPHEMERAL: 3,
};

const instance = {
  getToken: async () => 'mock-fcm-token',
  deleteToken: async () => {},
  requestPermission: async () => AuthorizationStatus.AUTHORIZED,
  hasPermission: async () => AuthorizationStatus.AUTHORIZED,
  onMessage: () => () => {},
  onTokenRefresh: () => () => {},
  onNotificationOpenedApp: () => () => {},
  getInitialNotification: async () => null,
  setBackgroundMessageHandler: () => {},
  subscribeToTopic: async () => {},
  unsubscribeFromTopic: async () => {},
};

function messaging() {
  return instance;
}
messaging.AuthorizationStatus = AuthorizationStatus;

module.exports = {
  __esModule: true,
  default: messaging,
  instance,
  AuthorizationStatus,
  getMessaging: () => instance,
  getToken: () => instance.getToken(),
  deleteToken: () => instance.deleteToken(),
  requestPermission: () => instance.requestPermission(),
  hasPermission: () => instance.hasPermission(),
  onMessage: (_m, cb) => instance.onMessage(cb),
  onTokenRefresh: (_m, cb) => instance.onTokenRefresh(cb),
  onNotificationOpenedApp: (_m, cb) => instance.onNotificationOpenedApp(cb),
  getInitialNotification: () => instance.getInitialNotification(),
  setBackgroundMessageHandler: (_m, cb) => instance.setBackgroundMessageHandler(cb),
  subscribeToTopic: (_m, topic) => instance.subscribeToTopic(topic),
  unsubscribeFromTopic: (_m, topic) => instance.unsubscribeFromTopic(topic),
};
