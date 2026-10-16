/**
 * Content-Security-Policy for the web app's HTML responses.
 *
 * Stripe's integration guide (docs.stripe.com/security/guide, "Stripe.js")
 * requires Stripe origins in script-src, frame-src and connect-src, and
 * recommends against a missing or `default-src *` policy. The allow-list below
 * is derived from the origins the app references in src/ (Firebase SDKs,
 * Firebase Analytics, Google Fonts, the Maps/YouTube embeds, and the
 * regroup-app:// deep-link iframe in the redirect component).
 *
 * script-src deliberately has no 'unsafe-inline' / 'unsafe-eval': index.html has
 * no inline scripts. style-src needs 'unsafe-inline' because Angular binds
 * inline styles.
 */
const STRIPE = "https://*.stripe.com https://*.js.stripe.com";
const FIREBASE_API = "https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net";
const ANALYTICS = "https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${STRIPE} https://apis.google.com ${ANALYTICS}`,
  `frame-src 'self' ${STRIPE} https://*.firebaseapp.com https://www.google.com https://www.youtube.com regroup-app: com.rats.dev:`,
  `connect-src 'self' ${STRIPE} ${FIREBASE_API} ${ANALYTICS}`,
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/**
 * Report-only until the policy has been observed against real traffic.
 *
 * The policy above was derived by reading `src/`, but `index.html` also loads
 * jQuery, popper, bootstrap and two bundles under `assets/js/` that are
 * minified and were not read. jQuery's DOMEval executes script by injecting a
 * <script> element with text content, which this policy blocks — `$.getScript`
 * and `.html()` on markup containing a script both go through it. Whether any
 * of that fires on this site is unknown without a browser.
 *
 * Shipping an enforcing policy that is wrong breaks the page, and one of the
 * pages is billing. Report-only collects the same violation reports and breaks
 * nothing, which is the normal way to roll a CSP out.
 *
 * To enforce: set CSP_ENFORCE=true on the function, confirm no violations are
 * being reported, and keep it enforcing. The flip needs no code change.
 */
export const CSP_HEADER_NAME =
  process.env.CSP_ENFORCE === 'true'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
