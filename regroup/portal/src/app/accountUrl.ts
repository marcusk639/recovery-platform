import { WEB_BASE_URL } from '@mobile/screens/Subscription/SubscriptionRequiredScreen';

/**
 * The website's account page, which hosts the Stripe billing portal. The portal
 * is a web page, so it links there directly, without the app's ?from=app.
 */
export const ACCOUNT_URL = `${WEB_BASE_URL}/my-account`;
