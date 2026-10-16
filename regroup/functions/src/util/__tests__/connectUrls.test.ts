import {
  connectBaseUrl,
  connectRefreshUrl,
  connectReturnUrl,
} from "../connectUrls";

const VARS = [
  "CONNECT_BASE_URL",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "GCP_PROJECT",
  "FUNCTION_REGION",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("connectBaseUrl", () => {
  it("uses CONNECT_BASE_URL and strips trailing slashes", () => {
    process.env.CONNECT_BASE_URL = "https://regroup-app.com/connect///";
    expect(connectBaseUrl()).toBe("https://regroup-app.com/connect");
  });

  it("refuses to run without CONNECT_BASE_URL", () => {
    // The paths are Hosting rewrites, so there is no origin to derive. Stripe
    // would send the operator to a 404 after they submitted bank details, on a
    // redirect this codebase never sees — undetectable from here.
    expect(() => connectBaseUrl()).toThrow(/CONNECT_BASE_URL is not set/);
  });

  it("does not silently derive an origin from the runtime project", () => {
    // Guards the regression this replaced: a derived cloudfunctions.net origin
    // was correct only while the paths were the function names.
    process.env.GCLOUD_PROJECT = "phoenix-cleanhouse";
    process.env.FUNCTION_REGION = "us-central1";
    expect(() => connectBaseUrl()).toThrow(/CONNECT_BASE_URL is not set/);
  });

  it("treats a whitespace-only override as unset", () => {
    process.env.CONNECT_BASE_URL = "   ";
    expect(() => connectBaseUrl()).toThrow(/CONNECT_BASE_URL is not set/);
  });
});

describe("connectReturnUrl / connectRefreshUrl", () => {
  beforeEach(() => {
    process.env.CONNECT_BASE_URL = "https://regroup-app.com/connect";
  });

  it("builds the operator-visible paths both entry points share", () => {
    expect(connectReturnUrl()).toBe(
      "https://regroup-app.com/connect/stripe-return",
    );
    expect(connectRefreshUrl("acct_123")).toBe(
      "https://regroup-app.com/connect/stripe-refresh?stripeAccountId=acct_123",
    );
  });

  it("uses the rewrite paths, not the function names", () => {
    // stripeConnectReturn / stripeConnectReauth are the function ids the
    // rewrites target; they must not leak into the operator-facing URL.
    const urls = [connectReturnUrl(), connectRefreshUrl("acct_1")].join(" ");
    expect(urls).not.toContain("stripeConnectReturn");
    expect(urls).not.toContain("stripeConnectReauth");
  });

  it("encodes the account id into the query string", () => {
    expect(connectRefreshUrl("acct_a&b=c")).toContain(
      "stripeAccountId=acct_a%26b%3Dc",
    );
  });
});
