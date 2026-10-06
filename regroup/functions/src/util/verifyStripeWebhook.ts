import type Stripe from 'stripe';

import {
  deployedStripeMode,
  type StripeMode,
  type WebhookSecretCandidate,
} from './stripeWebhookSecrets';

/**
 * Signature verification for an inbound Stripe webhook, shared by both handlers.
 *
 * Extracted because stripeWebhook and handleStripeConnectWebhook had ~27
 * byte-identical lines each, differing only in identifier names — so a fix to
 * one silently left the other wrong, which is how the mode check below came to
 * be missing from both.
 *
 * Two things happen here, in this order, and the order is the whole point:
 *
 * 1. SELECT the secret by trying every candidate. Before a signature verifies
 *    the body is unauthenticated, so nothing in the payload may choose the
 *    secret. One deployed URL can be registered as both a test and a live Stripe
 *    endpoint (two endpoints, two signing secrets), and a rolled secret stays
 *    valid alongside its replacement for an overlap window, so guessing one
 *    secret rejects legitimate traffic.
 *
 * 2. CHECK THE MODE, now that the body is authenticated. `event.livemode` is
 *    inside the signed payload: worthless at step 1, trustworthy at step 2. Both
 *    mode secrets are bound to both deployed functions, so without this check a
 *    LIVE deployment verifies and processes a test-mode event — and the handlers
 *    resolve their target from event metadata, not from a Stripe lookup, so a
 *    test-mode (or forged, if a low-value test signing secret ever leaks)
 *    payment_intent decrements rentOwed on a real guest and writes a real
 *    payment doc. The pre-rework code resolved a single secret from the
 *    deployment's own mode and so returned 400 here; this restores that property
 *    without reintroducing the single-secret guess.
 *
 * Two independent mode assertions are required, and neither alone is enough:
 *
 *   a. event.livemode must match the mode of the SECRET that verified.
 *      Stops a caller holding one mode's secret from claiming the other mode.
 *   b. event.livemode must match the mode of THIS DEPLOYMENT.
 *      Stops a genuine test-mode event, correctly signed with the test secret
 *      that is also bound here, from being processed against production data.
 *
 * Together they mean only the deployment's own mode secret can yield a processed
 * event. The opposite-mode secret stays bound and tried so that a mode
 * MISCONFIGURATION reports "wrong mode" rather than an opaque signature failure,
 * and so a future second same-mode secret (rotation overlap) needs no code
 * change.
 *
 * `livemode` is compared with `=== true` rather than coerced: a payload that
 * omits the field is treated as not-live, so it can never satisfy a live
 * deployment by absence.
 */

/** Why verification refused the request. Internal; never sent to the caller. */
export type VerifyFailureReason = 'signature' | 'mode';

export type VerifyWebhookResult =
  | {
      readonly ok: true;
      readonly event: Stripe.Event;
      /** Env var name of the secret that verified. Safe to log. */
      readonly verifiedWith: string;
      readonly mode: StripeMode;
    }
  | {
      readonly ok: false;
      readonly reason: VerifyFailureReason;
      /** Sanitized, log-safe detail. Contains no secret values and no PII. */
      readonly detail: Record<string, unknown>;
    };

export interface VerifyWebhookInput {
  readonly stripe: Stripe;
  readonly rawBody: Buffer | string;
  readonly signature: string | string[];
  readonly candidates: readonly WebhookSecretCandidate[];
}

export const verifyStripeWebhook = ({
  stripe,
  rawBody,
  signature,
  candidates,
}: VerifyWebhookInput): VerifyWebhookResult => {
  // Every candidate's failure is kept, in order. Overwriting a single variable
  // per iteration surfaced only the LAST candidate's error: when candidate 1
  // fails with "Timestamp outside the tolerance zone" (a replay) and candidate 2
  // with the generic "No signatures found", the diagnostic one was the one lost.
  const failures: Array<{ candidate: string; err: string }> = [];

  for (const candidate of candidates) {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature as string, candidate.value);
    } catch (err) {
      failures.push({ candidate: candidate.name, err: (err as Error).message });
      continue;
    }

    // Verified: from here `event` is authenticated and its `livemode` is sound.
    const eventMode: StripeMode = event.livemode === true ? 'live' : 'test';
    const deployed = deployedStripeMode();

    if (eventMode !== candidate.mode || eventMode !== deployed) {
      return {
        ok: false,
        reason: 'mode',
        detail: {
          eventId: event.id,
          eventType: event.type,
          eventMode,
          verifiedWith: candidate.name,
          secretMode: candidate.mode,
          deployedMode: deployed,
        },
      };
    }

    return {
      ok: true,
      event,
      verifiedWith: candidate.name,
      mode: candidate.mode,
    };
  }

  return {
    ok: false,
    reason: 'signature',
    detail: {
      candidatesTried: candidates.map((c) => `${c.name}:${c.mode}`),
      // First failure first — see the comment on `failures` above.
      errors: failures.map((f) => `${f.candidate}: ${f.err}`),
    },
  };
};
