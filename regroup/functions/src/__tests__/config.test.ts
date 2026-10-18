import { logger } from "firebase-functions";
import { connectAccountsApi, isTierBillingEnabled } from "../config";

describe("isTierBillingEnabled", () => {
  it("is false when unset", () => {
    delete process.env.TIER_BILLING_ENABLED;
    expect(isTierBillingEnabled()).toBe(false);
  });
  it("is true only for the exact string 'true'", () => {
    process.env.TIER_BILLING_ENABLED = "true";
    expect(isTierBillingEnabled()).toBe(true);
    process.env.TIER_BILLING_ENABLED = "1";
    expect(isTierBillingEnabled()).toBe(false);
  });
});

describe("connectAccountsApi", () => {
  afterEach(() => {
    delete process.env.CONNECT_ACCOUNTS_API;
  });
  it("defaults to v1 when unset", () => {
    // Accounts v2 needs Stripe to enable it for the platform; until then a v2
    // create is rejected, so v1 is the only safe default.
    delete process.env.CONNECT_ACCOUNTS_API;
    expect(connectAccountsApi()).toBe("v1");
  });
  it("warns when set to something other than v1 or v2, e.g. a typo of v2", () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    process.env.CONNECT_ACCOUNTS_API = "V2";

    expect(connectAccountsApi()).toBe("v1");
    expect(warn).toHaveBeenCalledWith(expect.any(String), { value: "V2" });
    warn.mockRestore();
  });
  it("stays quiet when unset, v1 or v2", () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    for (const value of [undefined, "v1", "v2"]) {
      if (value === undefined) delete process.env.CONNECT_ACCOUNTS_API;
      else process.env.CONNECT_ACCOUNTS_API = value;
      connectAccountsApi();
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("is v2 only for the exact string 'v2'", () => {
    process.env.CONNECT_ACCOUNTS_API = "v2";
    expect(connectAccountsApi()).toBe("v2");
    process.env.CONNECT_ACCOUNTS_API = "V2";
    expect(connectAccountsApi()).toBe("v1");
    process.env.CONNECT_ACCOUNTS_API = "true";
    expect(connectAccountsApi()).toBe("v1");
  });
});
