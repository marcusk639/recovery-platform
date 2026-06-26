/**
 * Canonical base URL for the Homegroups web app.
 *
 * Used to build every Stripe success/cancel/return URL, Connect redirect URL,
 * customer-portal return URL, and web invite link. When the production domain
 * is finalized (see docs/LAUNCH_BLOCKERS.md #5), set the APP_BASE_URL env var
 * (or Secret) — no other source file needs editing.
 *
 * Default preserves the historical hardcoded value so behaviour is unchanged
 * until the env var is set.
 */
export const APP_BASE_URL =
  process.env.APP_BASE_URL ?? "https://homegroups-app.com";
