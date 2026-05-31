/** @jest-environment node */
import "next/server"; // polyfills Web API globals (Request, Response, Headers) in Node env
import {
  checkHoneypot,
  checkOrigin,
  checkRateLimit,
  _resetRateLimit,
} from "@/lib/abuse-protection";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://nextsteprecovery.io/api/contact", { headers });
}

// ─── checkOrigin ────────────────────────────────────────────────────────────

describe("checkOrigin", () => {
  const originalEnv = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalEnv;
    }
  });

  it("returns ok:false when Origin header is absent", () => {
    expect(checkOrigin(makeReq())).toEqual({ ok: false });
  });

  it("returns ok:false for an unlisted origin", () => {
    expect(checkOrigin(makeReq({ origin: "https://evil.com" }))).toEqual({
      ok: false,
    });
  });

  it.each([
    "https://nextsteprecovery.io",
    "https://www.nextsteprecovery.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])("returns ok:true for default allowed origin %s", (origin) => {
    expect(checkOrigin(makeReq({ origin }))).toEqual({ ok: true });
  });

  it("respects ALLOWED_ORIGINS env var override", () => {
    process.env.ALLOWED_ORIGINS =
      "https://staging.nextsteprecovery.io,https://preview.nextsteprecovery.io";

    expect(
      checkOrigin(makeReq({ origin: "https://staging.nextsteprecovery.io" })),
    ).toEqual({ ok: true });

    // Default origins are NOT present when env var overrides
    expect(
      checkOrigin(makeReq({ origin: "https://nextsteprecovery.io" })),
    ).toEqual({ ok: false });
  });

  it("trims whitespace from ALLOWED_ORIGINS entries", () => {
    process.env.ALLOWED_ORIGINS =
      " https://staging.example.com , https://preview.example.com ";

    expect(
      checkOrigin(makeReq({ origin: "https://staging.example.com" })),
    ).toEqual({ ok: true });
  });
});

// ─── checkHoneypot ──────────────────────────────────────────────────────────

describe("checkHoneypot", () => {
  it("returns ok:true when website field is absent", () => {
    expect(checkHoneypot({})).toEqual({ ok: true });
  });

  it("returns ok:true when website field is empty string", () => {
    expect(checkHoneypot({ website: "" })).toEqual({ ok: true });
  });

  it("returns ok:true when website field is null", () => {
    expect(checkHoneypot({ website: null })).toEqual({ ok: true });
  });

  it("returns ok:true when website field is undefined", () => {
    expect(checkHoneypot({ website: undefined })).toEqual({ ok: true });
  });

  it("returns ok:false when website field has any non-empty value", () => {
    expect(checkHoneypot({ website: "https://example.com" })).toEqual({
      ok: false,
    });
  });

  it("returns ok:false for a whitespace-only website value", () => {
    expect(checkHoneypot({ website: "   " })).toEqual({ ok: false });
  });
});

// ─── checkRateLimit ─────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimit();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns ok:true when no IP headers are present (skips check)", () => {
    const req = makeReq(); // no x-forwarded-for, no x-real-ip
    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
    // Second call also passes — 'unknown' IP is never rate-limited
    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
  });

  it("returns ok:true on first request from a real IP", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
  });

  it("returns ok:false with retryAfter on second request within window", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    checkRateLimit(req, "contact");

    jest.advanceTimersByTime(5_000); // 5 s into the 60 s window

    const result = checkRateLimit(req, "contact");
    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("returns ok:true after the 60-second window expires", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    checkRateLimit(req, "contact");

    jest.advanceTimersByTime(60_001); // just past the window

    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
  });

  it("uses the first entry from a multi-hop XFF header", () => {
    // Real client is 1.1.1.1; proxies added 10.0.0.1 and 10.0.0.2
    const req = makeReq({ "x-forwarded-for": "1.1.1.1, 10.0.0.1, 10.0.0.2" });
    checkRateLimit(req, "contact");

    // A request with the same first hop should be rate-limited
    const req2 = makeReq({
      "x-forwarded-for": "1.1.1.1, 10.0.0.99",
    });
    const result = checkRateLimit(req2, "contact");
    expect(result.ok).toBe(false);
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeReq({ "x-real-ip": "5.6.7.8" });
    checkRateLimit(req, "contact");

    const result = checkRateLimit(
      makeReq({ "x-real-ip": "5.6.7.8" }),
      "contact",
    );
    expect(result.ok).toBe(false);
  });

  it("treats different routes from the same IP as independent buckets", () => {
    const ip = { "x-forwarded-for": "9.9.9.9" };
    checkRateLimit(makeReq(ip), "contact");

    // subscribe is a separate bucket — should still be ok
    expect(checkRateLimit(makeReq(ip), "subscribe")).toEqual({ ok: true });
  });

  it("treats different IPs as independent buckets", () => {
    checkRateLimit(makeReq({ "x-forwarded-for": "1.1.1.1" }), "contact");

    expect(
      checkRateLimit(makeReq({ "x-forwarded-for": "2.2.2.2" }), "contact"),
    ).toEqual({ ok: true });
  });

  it("skips the check when XFF first entry is empty (bot-crafted header)", () => {
    // Attacker sends ", 10.0.0.1" — first split entry is "" → falls through to "unknown" → skip
    const req = makeReq({ "x-forwarded-for": ", 10.0.0.1" });
    checkRateLimit(req, "contact");
    // Both calls pass — empty hop resolves to "unknown" which is never rate-limited
    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
  });

  it("allows a request at exactly the window boundary (strict less-than)", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    checkRateLimit(req, "contact");

    jest.advanceTimersByTime(60_000); // exactly at boundary — should be allowed (not <=)
    expect(checkRateLimit(req, "contact")).toEqual({ ok: true });
  });
});
