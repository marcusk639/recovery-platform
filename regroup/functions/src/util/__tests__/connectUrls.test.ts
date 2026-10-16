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
  it("derives the origin from the runtime project and default region", () => {
    process.env.GCLOUD_PROJECT = "phoenix-cleanhouse";
    expect(connectBaseUrl()).toBe(
      "https://us-central1-phoenix-cleanhouse.cloudfunctions.net",
    );
  });

  it("honours the deployed region rather than hardcoding us-central1", () => {
    // The inline version this replaced hardcoded us-central1, so a regional
    // deploy would have redirected operators at the wrong origin.
    process.env.GCLOUD_PROJECT = "phoenix-cleanhouse";
    process.env.FUNCTION_REGION = "europe-west1";
    expect(connectBaseUrl()).toBe(
      "https://europe-west1-phoenix-cleanhouse.cloudfunctions.net",
    );
  });

  it("falls through the project-id variables the runtime may supply", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "from-google-cloud";
    expect(connectBaseUrl()).toContain("from-google-cloud");
    delete process.env.GOOGLE_CLOUD_PROJECT;
    process.env.GCP_PROJECT = "from-gcp";
    expect(connectBaseUrl()).toContain("from-gcp");
  });

  it("prefers CONNECT_BASE_URL and strips trailing slashes", () => {
    process.env.GCLOUD_PROJECT = "ignored-when-overridden";
    process.env.CONNECT_BASE_URL = "https://connect.regroup-app.com///";
    expect(connectBaseUrl()).toBe("https://connect.regroup-app.com");
  });

  it("throws rather than emitting an origin with an empty project id", () => {
    // The old fallback produced "https://us-central1-.cloudfunctions.net":
    // valid enough for Stripe to accept as a redirect target, and resolving
    // nowhere, so onboarding broke with nothing to find it by.
    expect(() => connectBaseUrl()).toThrow(/no project id/i);
    process.env.GCLOUD_PROJECT = "   ";
    expect(() => connectBaseUrl()).toThrow(/no project id/i);
  });
});

describe("connectReturnUrl / connectRefreshUrl", () => {
  beforeEach(() => {
    process.env.GCLOUD_PROJECT = "phoenix-cleanhouse";
  });

  it("builds the paths both onboarding entry points share", () => {
    expect(connectReturnUrl()).toBe(
      "https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeConnectReturn",
    );
    expect(connectRefreshUrl("acct_123")).toBe(
      "https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeConnectReauth?stripeAccountId=acct_123",
    );
  });

  it("encodes the account id into the query string", () => {
    // Stripe ids are alphanumeric, so this is belt-and-braces — but the value
    // lands in a URL the operator follows, and an unencoded & or # would
    // silently truncate or re-point it.
    expect(connectRefreshUrl("acct_a&b=c")).toContain(
      "stripeAccountId=acct_a%26b%3Dc",
    );
  });
});
