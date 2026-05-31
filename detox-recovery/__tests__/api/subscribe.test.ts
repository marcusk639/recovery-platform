/** @jest-environment node */
import { POST } from "@/app/api/subscribe/route";
import { _resetRateLimit } from "@/lib/abuse-protection";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
  _resetRateLimit();
});
afterEach(() => {
  jest.resetAllMocks();
});

function makeRequest(
  body: unknown,
  init: { headers?: Record<string, string> } = {},
) {
  return new Request("http://localhost:3000/api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...init.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/subscribe", () => {
  it("returns 400 when email is missing", async () => {
    const res = await POST(
      makeRequest({ tag: "newsletter-withdrawal-field-notes" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when email has no @ sign", async () => {
    const res = await POST(
      makeRequest({
        email: "notanemail",
        tag: "newsletter-withdrawal-field-notes",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when tag is not a known value", async () => {
    const res = await POST(
      makeRequest({ email: "user@example.com", tag: "unknown-tag" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/tag/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = makeRequest("not-json");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with success:true when MailerLite is not configured (graceful degradation)", async () => {
    const res = await POST(
      makeRequest({
        email: "user@example.com",
        tag: "newsletter-withdrawal-field-notes",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 403 when Origin header is missing", async () => {
    const req = new Request("http://localhost:3000/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        tag: "newsletter-withdrawal-field-notes",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when Origin is not in the allow-list", async () => {
    const res = await POST(
      makeRequest(
        {
          email: "user@example.com",
          tag: "newsletter-withdrawal-field-notes",
        },
        { headers: { Origin: "https://evil.example.com" } },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with success:true when honeypot is filled (bot signal)", async () => {
    const res = await POST(
      makeRequest({
        email: "user@example.com",
        tag: "newsletter-withdrawal-field-notes",
        website: "http://attacker.example.com",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when the same IP submits twice within 60s", async () => {
    const headers = { "x-forwarded-for": "203.0.113.20" };
    const first = await POST(
      makeRequest(
        {
          email: "user@example.com",
          tag: "newsletter-withdrawal-field-notes",
        },
        { headers },
      ),
    );
    expect(first.status).toBe(200);
    const second = await POST(
      makeRequest(
        {
          email: "other@example.com",
          tag: "newsletter-withdrawal-field-notes",
        },
        { headers },
      ),
    );
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});
