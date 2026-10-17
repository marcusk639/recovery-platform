/**
 * The origin and paths Stripe redirects a house operator back to during
 * Connect onboarding.
 *
 * These URLs are built in two places — `connectStripeAccount` (the callable the
 * app invokes to start onboarding) and `stripeConnectReauth` (where Stripe
 * sends an operator whose link expired). They were duplicated, and had drifted:
 * one read the deployed region, the other hardcoded `us-central1`. A single
 * flow that redirects to two different origins is the kind of thing nobody
 * notices until onboarding half-works.
 *
 * NEVER derive these from the incoming request. `stripeConnectReauth` is
 * unauthenticated, so `req.hostname` is attacker-supplied: a spoofed Host would
 * put an attacker's origin into the URL Stripe sends the operator to after
 * onboarding. Everything below comes from deployment config, which a request
 * cannot influence.
 */

/**
 * Operator-visible paths for the two redirect targets.
 *
 * These are NOT the function names. `stripeConnectReturn` and
 * `stripeConnectReauth` are reachable at their own names on
 * *.cloudfunctions.net, so these paths only resolve behind a Firebase Hosting
 * rewrite that maps them to those functions:
 *
 *   regroup/web/firebase.json, ABOVE the "**" catch-all (Hosting matches in
 *   order, so the catch-all must stay last):
 *     { "source": "/connect/stripe-return",
 *       "function": { "functionId": "stripeConnectReturn", "region": "us-central1" } }
 *     { "source": "/connect/stripe-refresh",
 *       "function": { "functionId": "stripeConnectReauth", "region": "us-central1" } }
 *
 * and CONNECT_BASE_URL pointing at that prefix, e.g.
 *   CONNECT_BASE_URL=https://regroup-app.com/connect
 *
 * WITHOUT BOTH, onboarding breaks: Stripe sends the operator to a 404 after
 * they have finished entering their bank details, and nothing in this codebase
 * can detect that — the failure is on Stripe's redirect, not in a request we
 * serve. connectBaseUrl() therefore refuses to fall back to the bare
 * cloudfunctions.net origin once these paths are in use; see its check below.
 */
const RETURN_PATH = "stripe-return";
const REFRESH_PATH = "stripe-refresh";

/**
 * Origin the two redirect paths are served from.
 *
 * `CONNECT_BASE_URL` is REQUIRED, and is the rewrite prefix — not a bare
 * function origin. See RETURN_PATH above for the rewrites it must match.
 *
 * There is deliberately no derived fallback. A previous version built
 * `https://${region}-${project}.cloudfunctions.net`, which was correct only
 * while the paths were the function names. With the paths now served by
 * Hosting rewrites, a derived origin would hand Stripe a URL that 404s — and
 * the operator meets it *after* submitting their bank details, on a redirect
 * this codebase never sees, so nothing here could detect it. An earlier
 * version of that same fallback also defaulted a missing project id to '',
 * yielding `https://us-central1-.cloudfunctions.net`: syntactically valid,
 * accepted by Stripe, resolving nowhere. Both failures are silent, which is
 * why this now refuses to guess and fails at deploy-time configuration
 * instead.
 *
 * The region and project env vars are no longer read. They are injected by the
 * runtime and listed in the Firebase CLI's RESERVED_KEYS, so they cannot be
 * set in .env — which made them a poor place to encode a deployment decision
 * that Hosting, not the functions runtime, actually owns.
 */
export function connectBaseUrl(): string {
  const override = process.env.CONNECT_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  throw new Error(
    "connectBaseUrl: CONNECT_BASE_URL is not set. The Connect redirect paths " +
      `('${RETURN_PATH}', '${REFRESH_PATH}') are Firebase Hosting rewrites, ` +
      "so there is no origin to derive. Set CONNECT_BASE_URL to the rewrite " +
      "prefix (e.g. https://regroup-app.com/connect) and add the matching " +
      "rewrites above the '**' catch-all in regroup/web/firebase.json.",
  );
}

/** Where Stripe returns an operator who finished (or abandoned) onboarding. */
export function connectReturnUrl(): string {
  return `${connectBaseUrl()}/${RETURN_PATH}`;
}

/**
 * Where Stripe sends an operator whose onboarding link expired. Carries the
 * account id so that endpoint can mint a fresh link without authentication.
 */
export function connectRefreshUrl(stripeAccountId: string): string {
  return `${connectBaseUrl()}/${REFRESH_PATH}?stripeAccountId=${encodeURIComponent(
    stripeAccountId,
  )}`;
}
