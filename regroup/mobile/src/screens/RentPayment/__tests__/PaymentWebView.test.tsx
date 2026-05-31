/**
 * PaymentWebView — URL allowlist tests
 *
 * Covers the isAllowedPaymentUrl guard added per .full-review [S3]. The
 * WebView only loads URLs whose origin is on the Stripe allowlist; any
 * other host fails closed.
 */

import { isAllowedPaymentUrl } from '../PaymentWebView';

describe('isAllowedPaymentUrl', () => {
  describe('allowed origins', () => {
    it('accepts a checkout.stripe.com URL', () => {
      expect(
        isAllowedPaymentUrl('https://checkout.stripe.com/c/pay/cs_test_abc123'),
      ).toBe(true);
    });

    it('accepts a hooks.stripe.com URL', () => {
      expect(
        isAllowedPaymentUrl(
          'https://hooks.stripe.com/redirect/authenticate/src_abc',
        ),
      ).toBe(true);
    });

    it('accepts a checkout URL with query params', () => {
      expect(
        isAllowedPaymentUrl(
          'https://checkout.stripe.com/c/pay/cs_test_abc?lang=en&utm_source=app',
        ),
      ).toBe(true);
    });
  });

  describe('rejected origins', () => {
    it('rejects http (non-TLS) Stripe URL', () => {
      expect(
        isAllowedPaymentUrl('http://checkout.stripe.com/c/pay/cs_test_abc'),
      ).toBe(false);
    });

    it('rejects a look-alike domain (homograph)', () => {
      expect(
        isAllowedPaymentUrl(
          'https://checkout.stripe.com.attacker.tld/c/pay/cs_test_abc',
        ),
      ).toBe(false);
    });

    it('rejects a subdomain take-over candidate', () => {
      expect(
        isAllowedPaymentUrl('https://attacker.checkout.stripe.com/pay'),
      ).toBe(false);
    });

    it('rejects an arbitrary HTTPS URL', () => {
      expect(isAllowedPaymentUrl('https://evil.example.com/pay')).toBe(false);
    });

    it('rejects a js.stripe.com URL (script SDK host, not Checkout)', () => {
      expect(isAllowedPaymentUrl('https://js.stripe.com/v3/')).toBe(false);
    });

    it('rejects a javascript: scheme URL', () => {
      expect(
        isAllowedPaymentUrl('javascript:fetch("https://checkout.stripe.com")'),
      ).toBe(false);
    });

    it('rejects a data: URL', () => {
      expect(
        isAllowedPaymentUrl('data:text/html,<script>alert(1)</script>'),
      ).toBe(false);
    });

    it('rejects a file: URL', () => {
      expect(isAllowedPaymentUrl('file:///etc/passwd')).toBe(false);
    });
  });

  describe('malformed / edge-case input', () => {
    it('rejects an empty string', () => {
      expect(isAllowedPaymentUrl('')).toBe(false);
    });

    it('rejects null / undefined inputs', () => {
      // Defensive: callers pass `route.params?.paymentUrl` which can be undefined.
      expect(isAllowedPaymentUrl(undefined as any)).toBe(false);
      expect(isAllowedPaymentUrl(null as any)).toBe(false);
    });

    it('rejects a non-URL string', () => {
      expect(isAllowedPaymentUrl('not a url')).toBe(false);
    });

    it('rejects a relative path', () => {
      expect(isAllowedPaymentUrl('/pay/cs_test_abc')).toBe(false);
    });
  });
});
