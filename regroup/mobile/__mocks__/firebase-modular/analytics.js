/** Dual-shape @react-native-firebase/analytics mock (not part of the operation log). */
const instance = {
  logEvent: async () => {},
  logScreenView: async () => {},
  setUserId: async () => {},
  setUserProperty: async () => {},
  setAnalyticsCollectionEnabled: async () => {},
};

function analytics() {
  return instance;
}

module.exports = {
  __esModule: true,
  default: analytics,
  instance,
  getAnalytics: () => instance,
  logEvent: (_a, name, params) => instance.logEvent(name, params),
  logScreenView: (_a, params) => instance.logScreenView(params),
  setUserId: (_a, id) => instance.setUserId(id),
  setUserProperty: (_a, name, value) => instance.setUserProperty(name, value),
  setAnalyticsCollectionEnabled: (_a, enabled) => instance.setAnalyticsCollectionEnabled(enabled),
};
