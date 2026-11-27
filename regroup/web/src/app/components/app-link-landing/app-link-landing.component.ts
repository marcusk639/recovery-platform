import { Component } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/regroup-sober-living-app/id1502040260';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.regroup.app';

const APP_SCHEME = 'regroup-app://';
// The app routes these web paths stand for (regroup/app-links.json `paths`):
// /invite -> invite, /checkout-return -> app/checkout-return, /app/* -> app/*.
const ROUTE = /^\/(invite|checkout-return|app(?:\/[A-Za-z0-9_-]+)*)\/?$/;
// Anything outside the RFC 3986 query characters is percent-encoded, so the
// href carries no markup or whitespace.
const UNSAFE_QUERY_CHAR = /[^A-Za-z0-9\-._~!$&'()*+,;=:@/?%]/g;
// The token the app accepts (regroup/mobile parseAppLink.ts TOKEN).
const TOKEN = /^[A-Za-z0-9._~-]{1,256}$/;

/** Exactly one token value, in the form the app reads. */
const hasReadableToken = (query: string): boolean => {
  const tokens = new URLSearchParams(query.replace(/^\?/, '')).getAll('token');
  return tokens.length > 0 && tokens.every((t) => t === tokens[0]) && TOKEN.test(tokens[0]);
};

/**
 * The page behind every app link: shown when an invitation, checkout hand-back
 * or /app/* link opens in the browser instead of the app (not installed, or app
 * links not verified). One tap opens the app with the same path and query; no
 * automatic redirect. The token is never displayed or logged.
 */
@Component({
  selector: 'app-app-link-landing',
  templateUrl: './app-link-landing.component.html',
  styleUrls: ['./app-link-landing.component.scss'],
})
export class AppLinkLandingComponent {
  readonly appStoreUrl = APP_STORE_URL;
  readonly playStoreUrl = PLAY_STORE_URL;
  readonly isCheckoutReturn: boolean;
  /** An /invite link whose token the app couldn't read: no Open button. */
  readonly isIncompleteInvitation: boolean;
  readonly appUrl: SafeUrl | null;

  constructor(router: Router, sanitizer: DomSanitizer) {
    const [pathAndQuery] = router.url.split('#');
    const queryStart = pathAndQuery.indexOf('?');
    const path = queryStart === -1 ? pathAndQuery : pathAndQuery.slice(0, queryStart);
    const query = queryStart === -1 ? '' : pathAndQuery.slice(queryStart);
    const match = ROUTE.exec(path);
    const route = match
      ? match[1] === 'checkout-return'
        ? 'app/checkout-return'
        : match[1]
      : null;
    this.isCheckoutReturn = route === 'app/checkout-return';
    this.isIncompleteInvitation = route === 'invite' && !hasReadableToken(query);
    // The scheme is a constant and the path is allowlisted, so this URL can't
    // be javascript: or another origin; Angular would otherwise rewrite the
    // custom scheme to `unsafe:`.
    this.appUrl =
      route && !this.isIncompleteInvitation
        ? sanitizer.bypassSecurityTrustUrl(
            `${APP_SCHEME}${route}${query.replace(UNSAFE_QUERY_CHAR, encodeURIComponent)}`,
          )
        : null;
  }
}
