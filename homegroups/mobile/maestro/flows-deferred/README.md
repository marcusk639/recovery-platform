# Deferred Maestro Flows

## Intergroup Tier A/B checkout + upgrade

Not built. `IntergroupDashboardScreen` (and the rest of `src/screens/intergroup/`) has no
in-app entry point in the current build: `SHOW_V4_ENTERPRISE_INTERGROUP` is `false` in
`src/config/featureFlags.ts`, and `AppNavigator.tsx` only mounts `IntergroupNavigator` when
that flag is true. No screen navigates there and no deep link was found. `createIntergroup`
(the checkout-creation callable) has zero call sites in `mobile/src` — intergroup creation
appears to be a web-only flow today; mobile only has the upgrade path
(`IntergroupDashboardScreen.handleUpgrade`, which hands off to an external browser via
`Linking.openURL`, not an in-app WebView).

Build this flow once one of the following happens:

1. `SHOW_V4_ENTERPRISE_INTERGROUP` is flipped `true` for a debug/CI build, or
2. A deep-link route to `IntergroupDashboard` is added.

Until then, this is out of scope — not a gap in this migration.
