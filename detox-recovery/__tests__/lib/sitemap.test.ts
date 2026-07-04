import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("includes the core routes", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://nextsteprecovery.io");
    expect(urls).toContain("https://nextsteprecovery.io/privacy");
    expect(urls).toContain("https://nextsteprecovery.io/terms");
    expect(urls).toContain("https://nextsteprecovery.io/contact");
  });

  it("gives every entry a lastModified date", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
