// src/navigation/service.ts
//
// Thin shim kept for backward-compat of `navigationRef` imports.
// The improved navigation service is the only service; the old
// NavigationService class and compatibility layer have been removed.
// `navigationRef` is re-exported from improved-navigation-service so that
// index.js (NavigationContainer) and service methods share the same ref.

export { navigationRef } from './improved-navigation-service';
export { default } from './improved-navigation-service';
export { default as improvedNavigationService } from './improved-navigation-service';
