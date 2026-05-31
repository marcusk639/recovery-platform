/** @jest-environment node */
import { POST } from "@/app/api/contact/route";
import { _resetRateLimit } from "@/lib/abuse-protection";

// Mock Resend so tests never call the real API
jest.mock("resend", () => {
  const mockSend = jest.fn().mockResolvedValue({ id: "mock-email-id" });
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
  };
});

function makeRequest(
  body: unknown,
  init: { headers?: Record<string, string> } = {},
) {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...init.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetRateLimit();
});

describe("POST /api/contact", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", message: "Hello" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/name/i);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await POST(
      makeRequest({ name: "Dr Smith", email: "notvalid", message: "Hello" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({ name: "Dr Smith", email: "a@b.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/message/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = makeRequest("not-json");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with success:true when Resend is not configured", async () => {
    // In test env, RESEND_API_KEY and RESEND_TO_EMAIL are undefined
    const res = await POST(
      makeRequest({
        name: "Dr Smith",
        email: "a@b.com",
        message: "Interested.",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 403 when Origin header is missing", async () => {
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dr Smith",
        email: "a@b.com",
        message: "Hello",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when Origin is not in the allow-list", async () => {
    const res = await POST(
      makeRequest(
        { name: "Dr Smith", email: "a@b.com", message: "Hello" },
        { headers: { Origin: "https://evil.example.com" } },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with success:true when honeypot is filled (bot signal)", async () => {
    const res = await POST(
      makeRequest({
        name: "Dr Smith",
        email: "a@b.com",
        message: "Hello",
        website: "http://attacker.example.com",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 429 when the same IP submits twice within 60s", async () => {
    const headers = { "x-forwarded-for": "203.0.113.10" };
    const first = await POST(
      makeRequest(
        { name: "Dr Smith", email: "a@b.com", message: "Hello" },
        { headers },
      ),
    );
    expect(first.status).toBe(200);
    const second = await POST(
      makeRequest(
        { name: "Dr Smith", email: "a@b.com", message: "Hello again" },
        { headers },
      ),
    );
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});
