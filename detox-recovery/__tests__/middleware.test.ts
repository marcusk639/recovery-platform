/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

// Reset the in-memory rate-limit map between tests by re-importing the module
// fresh each time via jest.isolateModules. This prevents state leakage across tests.
function makeRequest(
  path: string,
  ip = "1.2.3.4",
  method = "POST"
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "x-forwarded-for": ip },
  });
}

describe("rate-limiting middleware", () => {
  let middleware: (req: NextRequest) => Response | Promise<Response>;

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ middleware } = require("../middleware"));
  });

  it("passes the first request through", async () => {
    const res = await middleware(makeRequest("/api/contact"));
    expect(res.status).toBe(200);
  });

  it("allows up to the limit for /api/contact (5 req/min)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await middleware(makeRequest("/api/contact", "10.0.0.1"));
      expect(res.status).toBe(200);
    }
    const blocked = await middleware(makeRequest("/api/contact", "10.0.0.1"));
    expect(blocked.status).toBe(429);
  });

  it("allows up to the limit for /api/subscribe (10 req/min)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await middleware(makeRequest("/api/subscribe", "10.0.0.2"));
      expect(res.status).toBe(200);
    }
    const blocked = await middleware(makeRequest("/api/subscribe", "10.0.0.2"));
    expect(blocked.status).toBe(429);
  });

  it("returns Retry-After header on 429", async () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 5; i++) {
      await middleware(makeRequest("/api/contact", ip));
    }
    const res = await middleware(makeRequest("/api/contact", ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("counts are isolated per IP", async () => {
    const ipA = "20.0.0.1";
    const ipB = "20.0.0.2";
    for (let i = 0; i < 5; i++) {
      await middleware(makeRequest("/api/contact", ipA));
    }
    // ipA is now blocked, ipB should still pass
    const resA = await middleware(makeRequest("/api/contact", ipA));
    const resB = await middleware(makeRequest("/api/contact", ipB));
    expect(resA.status).toBe(429);
    expect(resB.status).toBe(200);
  });

  it("does not rate-limit routes outside the matcher", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await middleware(makeRequest("/api/other", "30.0.0.1"));
      expect(res.status).toBe(200);
    }
  });
});
