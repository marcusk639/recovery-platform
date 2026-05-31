/**
 * Universal HTTP handler (v2).
 *
 * A catch-all onRequest endpoint that can be used for general-purpose HTTP
 * requests, health checks, and routing that does not fit into the typed
 * callable or trigger categories.  Extend the route map below as needed.
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

export const universal = onRequest(async (req, res) => {
  logger.info("universal: incoming request", {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  // Health-check route — used by uptime monitors and load balancers.
  if (req.path === "/health" || req.path === "/healthz") {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    return;
  }

  // Default response for unrecognised paths.
  res.status(404).json({ error: "Not found", path: req.path });
});
