import { webBaseUrl } from '@mobile/config/env';

/**
 * The website's account page, which hosts the Stripe billing portal. The portal
 * is a web page, so it links there directly, without the app's ?from=app.
 */
export const ACCOUNT_URL = `${webBaseUrl()}/my-account`;
