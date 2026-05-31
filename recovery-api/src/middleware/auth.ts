import { createMiddleware } from "hono/factory";
import { auth } from "../lib/firebase.js";

type AuthVariables = {
  uid: string;
  email: string;
};

declare module "hono" {
  interface ContextVariableMap extends AuthVariables {}
}

const SERVICE_KEY = process.env.INTERNAL_API_KEY;

export const requireAuth = createMiddleware(async (c, next) => {
  // Server-to-server: internal services pass X-Service-Key instead of a user token
  const serviceKey = c.req.header("X-Service-Key");
  if (SERVICE_KEY && serviceKey === SERVICE_KEY) {
    c.set("uid", "system");
    c.set("email", "system@internal");
    await next();
    return;
  }

  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    c.set("uid", decoded.uid);
    c.set("email", decoded.email ?? "");
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});
