export {};
import { assertGroupActive } from "../utils/subscriptionGuard";
import { HttpsError } from "firebase-functions/v1/https";

describe("assertGroupActive", () => {
  it("does not throw for status 'active'", () => {
    expect(() =>
      assertGroupActive({ subscriptionStatus: "active" }),
    ).not.toThrow();
  });

  it("does not throw for status 'trialing'", () => {
    expect(() =>
      assertGroupActive({ subscriptionStatus: "trialing" }),
    ).not.toThrow();
  });

  it.each(["canceled", "past_due", "incomplete", "unpaid"])(
    "throws HttpsError for status '%s'",
    (status) => {
      expect(() => assertGroupActive({ subscriptionStatus: status })).toThrow(
        HttpsError,
      );
    },
  );

  it("throws HttpsError when subscriptionStatus is undefined", () => {
    expect(() => assertGroupActive({})).toThrow(HttpsError);
  });

  it("throws HttpsError when subscriptionStatus is null", () => {
    expect(() => assertGroupActive({ subscriptionStatus: null })).toThrow(
      HttpsError,
    );
  });
});
