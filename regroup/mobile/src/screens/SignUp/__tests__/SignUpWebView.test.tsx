/**
 * Tests for SignUpWebView's isAllowedSignupUrl helper.
 *
 * Regression coverage for 2026-07-07: this security-relevant rewrite (origin
 * allowlist, fail-closed behavior) shipped with zero unit tests — not even
 * for this trivially-testable pure function, which is the actual gate
 * deciding whether the WebView is allowed to load a URL at all.
 */

import { isAllowedSignupUrl } from "../SignUpWebView";

describe("isAllowedSignupUrl", () => {
  it("allows the exact allowlisted signup URL", () => {
    expect(isAllowedSignupUrl("https://regroup-app.com/pricing")).toBe(true);
  });

  it("allows other paths on the allowlisted origin", () => {
    expect(isAllowedSignupUrl("https://regroup-app.com/some/other/path")).toBe(
      true
    );
  });

  it("rejects a different host entirely", () => {
    expect(isAllowedSignupUrl("https://evil.com/pricing")).toBe(false);
  });

  it("rejects a lookalike host (allowlisted domain as a subdomain of an attacker domain)", () => {
    expect(isAllowedSignupUrl("https://regroup-app.com.evil.com/pricing")).toBe(
      false
    );
  });

  it("rejects a lookalike host (attacker subdomain of the allowlisted domain)", () => {
    expect(isAllowedSignupUrl("https://evil.regroup-app.com/pricing")).toBe(
      false
    );
  });

  it("rejects the previously-hardcoded dev URL", () => {
    expect(isAllowedSignupUrl("https://rats-dev.web.app/pricing")).toBe(false);
  });

  it("rejects http (non-https) even for the correct host", () => {
    expect(isAllowedSignupUrl("http://regroup-app.com/pricing")).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    expect(isAllowedSignupUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects an unparseable URL instead of throwing", () => {
    expect(() => isAllowedSignupUrl("not a url")).not.toThrow();
    expect(isAllowedSignupUrl("not a url")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isAllowedSignupUrl("")).toBe(false);
  });

  it("rejects non-string input without throwing", () => {
    expect(() => isAllowedSignupUrl(undefined as any)).not.toThrow();
    expect(isAllowedSignupUrl(undefined as any)).toBe(false);
    expect(isAllowedSignupUrl(null as any)).toBe(false);
  });
});
