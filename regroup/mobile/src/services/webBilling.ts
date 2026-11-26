import { Alert, Linking } from 'react-native';
import { webBaseUrl } from '../config/env';
import { logException } from '../util/logging';

/**
 * Plans are bought and managed on the web, in the system browser (launch spec
 * §4.1 item 6, design A6): no screen in the app collects card details, so App
 * Store guideline 3.1.1 doesn't apply to the app. The web pages hand back
 * through /checkout-return (Tasks 10 and 11).
 *
 * Neither page may be claimed by regroup/app-links.json, or the OS would
 * reopen the app instead of the browser (a test pins this).
 */
export type WebBillingPage = 'pricing' | 'my-account';

// Only from=app: nothing about the user (an email, say) goes into the URL,
// where it would land in browser history.
export const webBillingUrl = (page: WebBillingPage): string => `${webBaseUrl()}/${page}?from=app`;

/** Opens a billing page in the browser. Returns false, after an alert, when it can't. */
export const openWebBilling = async (page: WebBillingPage): Promise<boolean> => {
  try {
    await Linking.openURL(webBillingUrl(page));
    return true;
  } catch {
    // A fixed message, not the caught error, which can carry the URL.
    logException(new Error(`openWebBilling: the browser did not open ${page}`));
    Alert.alert('Unable to open browser', `Please visit ${webBaseUrl()}/${page}.`);
    return false;
  }
};
