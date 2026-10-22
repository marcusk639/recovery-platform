import * as fs from "fs";
import * as path from "path";
import {
  ALLOWED_RETURN_ORIGINS,
  allowedReturnOrigins,
  safeReturnUrlSchema,
} from "../../validation";

const PRODUCTION_ORIGINS = [
  "https://regroup-app.com",
  "https://phoenix-cleanhouse.web.app",
  "https://phoenix-cleanhouse.firebaseapp.com",
  "http://localhost:4200",
];

describe("allowedReturnOrigins", () => {
  const original = process.env.ALLOWED_RETURN_ORIGINS;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOWED_RETURN_ORIGINS;
    else process.env.ALLOWED_RETURN_ORIGINS = original;
  });

  it("falls back to the production origins when unset", () => {
    delete process.env.ALLOWED_RETURN_ORIGINS;
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
    expect(ALLOWED_RETURN_ORIGINS).toEqual(PRODUCTION_ORIGINS);
  });

  it("falls back to the production origins when empty or only separators", () => {
    process.env.ALLOWED_RETURN_ORIGINS = " , ,";
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
    process.env.ALLOWED_RETURN_ORIGINS = "";
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
  });

  it("returns exactly the configured origin", () => {
    process.env.ALLOWED_RETURN_ORIGINS = "https://regroup-e2e.web.app";
    expect(allowedReturnOrigins()).toEqual(["https://regroup-e2e.web.app"]);
  });

  it("trims entries and drops empties in a comma-joined list", () => {
    process.env.ALLOWED_RETURN_ORIGINS =
      "https://regroup-e2e.web.app, https://regroup-e2e.firebaseapp.com,,";
    expect(allowedReturnOrigins()).toEqual([
      "https://regroup-e2e.web.app",
      "https://regroup-e2e.firebaseapp.com",
    ]);
  });

  it("normalises entries to origins so a trailing slash cannot mismatch", () => {
    process.env.ALLOWED_RETURN_ORIGINS =
      "https://regroup-e2e.web.app/, http://localhost:4200/path";
    expect(allowedReturnOrigins()).toEqual([
      "https://regroup-e2e.web.app",
      "http://localhost:4200",
    ]);
    expect(
      safeReturnUrlSchema.safeParse("https://regroup-e2e.web.app/r").success,
    ).toBe(true);
  });

  it("denies everything when every configured entry is unparsable", () => {
    process.env.ALLOWED_RETURN_ORIGINS = "not a url";
    expect(allowedReturnOrigins()).toEqual([]);
    expect(
      safeReturnUrlSchema.safeParse("https://regroup-app.com/x").success,
    ).toBe(false);
  });

  describe("safeReturnUrlSchema", () => {
    it("rejects evil origins with the default list", () => {
      delete process.env.ALLOWED_RETURN_ORIGINS;
      expect(
        safeReturnUrlSchema.safeParse("https://evil.example/x").success,
      ).toBe(false);
      expect(
        safeReturnUrlSchema.safeParse("https://regroup-app.com/x").success,
      ).toBe(true);
    });

    it("honours the configured list at parse time and still rejects evil", () => {
      process.env.ALLOWED_RETURN_ORIGINS = "https://regroup-e2e.web.app";
      expect(
        safeReturnUrlSchema.safeParse("https://regroup-e2e.web.app/r").success,
      ).toBe(true);
      expect(
        safeReturnUrlSchema.safeParse("https://evil.example/x").success,
      ).toBe(false);
      expect(
        safeReturnUrlSchema.safeParse("https://regroup-app.com/x").success,
      ).toBe(false);
    });
  });

  it("subscriptions.ts uses the shared schema rather than its own list", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../callable/subscriptions.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/ALLOWED_PORTAL_RETURN_ORIGINS/);
    expect(src).not.toMatch(/const safeReturnUrlSchema/);
    expect(src).toMatch(/safeReturnUrlSchema[\s\S]*from "\.\.\/validation"/);
  });
});
