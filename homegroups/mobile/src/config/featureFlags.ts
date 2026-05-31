// mobile/src/config/featureFlags.ts
// Set a flag to `true` to re-enable a hidden feature.
// All flags default to false until the feature is ready for users.

export const FEATURE_FLAGS = {
  // V4.1: Advanced Governance — only Minutes + TermsDashboard are shown
  SHOW_V4_GOVERNANCE_BYLAWS: false, // Guidelines/Bylaws tile
  SHOW_V4_GOVERNANCE_ELECTIONS: false, // Elections link in Service Positions
  SHOW_V4_GOVERNANCE_GSR_REPORT: false, // GSR Report tile (admin-only)

  // V4.2: Content & Resources — all hidden
  SHOW_V4_CONTENT_DAILY_REFLECTION: true, // Profile: Daily Reflection
  SHOW_V4_CONTENT_LITERATURE: false, // Profile: Literature & Resources
  SHOW_V4_CONTENT_SOBRIETY_CALCULATOR: false, // Profile: Sobriety Calculator
  SHOW_V4_CONTENT_MEETING_TOPICS: false, // SecretaryToolkit: Meeting Topics
  SHOW_V4_CONTENT_GROUP_RESOURCES: false, // Group Overview: Resources tile

  // V4.3: Analytics — all hidden
  SHOW_V4_ANALYTICS_GROUP_HEALTH: false, // Group Overview: Group Health admin button
  SHOW_V4_ANALYTICS_TREASURY_TRENDS: false, // Treasury Screen: Trends link
  SHOW_V4_ANALYTICS_MY_RECOVERY_JOURNEY: false, // Profile: My Recovery Journey

  // V4.4: Enterprise — all hidden
  SHOW_V4_ENTERPRISE_DATA_EXPORT: false, // Group Overview: Export Group Data admin button
  SHOW_V4_ENTERPRISE_INTERGROUP: false, // AppNavigator: Intergroup modal
} as const;
