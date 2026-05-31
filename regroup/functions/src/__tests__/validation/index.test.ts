jest.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { z } from "zod";
import { parseInput } from "../../validation";
import { HttpsError } from "firebase-functions/v2/https";

const schema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe("parseInput", () => {
  it("returns parsed data when input is valid", () => {
    const result = parseInput(schema, { name: "Alice", age: 30 });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("throws HttpsError with invalid-argument code on invalid input", () => {
    expect(() => parseInput(schema, { name: "", age: 30 })).toThrow(HttpsError);
    try {
      parseInput(schema, { name: "", age: 30 });
    } catch (err) {
      expect((err as any).code).toBe("invalid-argument");
    }
  });

  it("throws HttpsError when a required field is missing", () => {
    expect(() => parseInput(schema, { name: "Bob" })).toThrow(HttpsError);
  });

  it("throws HttpsError when wrong type is supplied", () => {
    expect(() => parseInput(schema, { name: "Bob", age: "thirty" })).toThrow(
      HttpsError,
    );
  });

  it("includes a human-readable message from Zod", () => {
    try {
      parseInput(schema, { name: "", age: 30 });
    } catch (err) {
      expect((err as any).message).toBeTruthy();
    }
  });

  it("re-throws non-ZodError exceptions unchanged", () => {
    const badSchema = {
      parse: () => {
        throw new RangeError("unexpected");
      },
    } as any;
    expect(() => parseInput(badSchema, {})).toThrow(RangeError);
  });
});
