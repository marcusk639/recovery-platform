import { generateInvitationToken } from "../tokens";

describe("generateInvitationToken", () => {
  it("returns a non-empty string", () => {
    const t = generateInvitationToken();
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThan(20);
  });

  it("is base64url (no +, /, or = padding)", () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never collides across 1000 calls (random — not a hash test)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = generateInvitationToken();
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });
});
