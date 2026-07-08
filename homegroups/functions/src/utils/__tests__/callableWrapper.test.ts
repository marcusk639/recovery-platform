export {};

jest.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

import { z } from "zod";
import { requireAuth, validateData } from "../callableWrapper";

describe("requireAuth", () => {
  it("returns the uid when request.auth is present", () => {
    const request = { auth: { uid: "user-1" } } as any;
    expect(requireAuth(request)).toBe("user-1");
  });

  it("throws unauthenticated when request.auth is absent", () => {
    const request = { auth: undefined } as any;
    expect(() => requireAuth(request)).toThrow(
      expect.objectContaining({ code: "unauthenticated" })
    );
  });
});

describe("validateData", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("returns the parsed data when input is valid", () => {
    const result = validateData(schema, { name: "Alice", age: 30 });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("strips unknown fields not on the schema (allow-list behavior)", () => {
    const result = validateData(schema, {
      name: "Alice",
      age: 30,
      stripeCustomerId: "cus_should_be_stripped",
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
    expect((result as any).stripeCustomerId).toBeUndefined();
  });

  it("throws invalid-argument with a descriptive message when input is invalid", () => {
    expect(() => validateData(schema, { name: "", age: -1 })).toThrow(
      expect.objectContaining({ code: "invalid-argument" })
    );
  });

  it("throws invalid-argument when required fields are missing entirely", () => {
    expect(() => validateData(schema, {})).toThrow(
      expect.objectContaining({ code: "invalid-argument" })
    );
  });
});
