import robots from "@/app/robots";

describe("robots", () => {
  it("allows all crawlers", () => {
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("points to the production sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://nextsteprecovery.io/sitemap.xml");
  });
});
