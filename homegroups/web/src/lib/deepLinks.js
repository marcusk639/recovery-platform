/**
 * Deep-link helpers for the public group page CTAs.
 *
 * Universal Links: on iOS/Android with the app installed, these URLs open
 * the app directly. Without the app, they stay in the browser and we
 * redirect to the appropriate store.
 */

const APP_STORE_URL = "https://apps.apple.com/app/homegroups/id0000000000"; // TODO: real ID
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.homegroups";
// Note: update to the custom domain (homegroups-app.com) once DNS is configured.
// Firebase Hosting's default domain is what's live today.
const WEB_ORIGIN = "https://recovery-connect-cad4b.web.app";

export function buildGroupDeepLink(groupId) {
  return `${WEB_ORIGIN}/groups/${encodeURIComponent(groupId)}`;
}

export function buildClaimDeepLink(groupId) {
  return `${WEB_ORIGIN}/groups/${encodeURIComponent(groupId)}/claim`;
}

export function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function getStoreUrl() {
  const platform = detectPlatform();
  if (platform === "ios") return APP_STORE_URL;
  if (platform === "android") return PLAY_STORE_URL;
  // Desktop: send to iOS (default) — user will figure it out
  return APP_STORE_URL;
}
