import { ZodSchema, ZodError } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "Invalid input";
      throw new HttpsError("invalid-argument", message);
    }
    throw err;
  }
}
