import { health } from "./health.js";

describe("GET /", () => {
  it("returns ok: true with a timestamp", async () => {
    const req = new Request("http://localhost/");
    const res = await health.fetch(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ts: string };
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe("string");
    expect(new Date(body.ts).toString()).not.toBe("Invalid Date");
  });
});
