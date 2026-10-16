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

/** Region the functions are deployed to; matches the project's deploy default. */
const DEFAULT_REGION = "us-central1";

/**
 * Origin for the Connect redirect URLs.
 *
 * `CONNECT_BASE_URL` overrides it, for a custom domain or a preview deploy.
 * Otherwise it is derived from the project and region supplied by the runtime.
 *
 * Throws on a missing project id rather than falling back to ''. That fallback
 * produced `https://us-central1-.cloudfunctions.net` — syntactically valid, so
 * Stripe accepts it as a redirect target, and it resolves nowhere. Onboarding
 * would break with no error to find it by. Failing here is louder and lands on
 * the call that was about to mint the bad URL.
 */
export function connectBaseUrl(): string {
  const override = process.env.CONNECT_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");

  const project = (
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    ""
  ).trim();
  if (!project) {
    throw new Error(
      "connectBaseUrl: no project id in GCLOUD_PROJECT, " +
        "GOOGLE_CLOUD_PROJECT or GCP_PROJECT, and no CONNECT_BASE_URL " +
        "override. Refusing to build a Connect redirect URL that would not " +
        "resolve.",
    );
  }

  const region = (process.env.FUNCTION_REGION ?? DEFAULT_REGION).trim();
  return `https://${region}-${project}.cloudfunctions.net`;
}

/** Where Stripe returns an operator who finished (or abandoned) onboarding. */
export function connectReturnUrl(): string {
  return `${connectBaseUrl()}/stripeConnectReturn`;
}

/**
 * Where Stripe sends an operator whose onboarding link expired. Carries the
 * account id so that endpoint can mint a fresh link without authentication.
 */
export function connectRefreshUrl(stripeAccountId: string): string {
  return `${connectBaseUrl()}/stripeConnectReauth?stripeAccountId=${encodeURIComponent(
    stripeAccountId,
  )}`;
}
