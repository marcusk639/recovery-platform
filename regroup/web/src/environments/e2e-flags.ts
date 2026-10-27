// Settings shared by every e2e environment (environment.e2e-emulator.ts and
// environment.e2e-staging.ts). Spread into both, so the e2e-env spec can check
// the staging build's flags without importing its generated config.
//
// useAnalytics: false — there is no Analytics emulator, so the e2e builds skip
// AngularFireAnalyticsModule and provide a no-op AngularFireAnalytics instead
// (src/app/analytics-providers.ts).
export const e2eFlags = {
  useAnalytics: false,
};
