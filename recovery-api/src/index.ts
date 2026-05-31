import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { referrals } from "./routes/referrals.js";
import { users } from "./routes/users.js";
import { requireAuth } from "./middleware/auth.js";

const app = new Hono();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use("*", cors({ origin: allowedOrigins }));

app.route("/health", health);

app.use("/api/*", requireAuth);
app.route("/api/referrals", referrals);
app.route("/api/users", users);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = parseInt(process.env.PORT ?? "8080");
serve({ fetch: app.fetch, port }, () => {
  console.log(`recovery-shared-api listening on :${port}`);
});
