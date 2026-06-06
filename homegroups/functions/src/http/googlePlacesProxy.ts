// functions/src/http/googlePlacesProxy.ts
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "express";
import Axios from "axios";

// HTTP proxy for the Google Maps Places web service, fronted by
// react-native-google-places-autocomplete on the client.
//
// Why this exists:
//   The autocomplete library calls Google directly from the device using the
//   key in its `query.key` prop, which means the key ships in the app bundle.
//   Pointing the library's `requestUrl` at this function instead keeps the real
//   key server-side (Cloud Secret Manager: GOOGLE_MAPS_API_KEY) — the bundle
//   only carries a placeholder.
//
// The library issues GET requests to:
//   <thisFunctionUrl>/place/autocomplete/json?input=...&key=<placeholder>&...
//   <thisFunctionUrl>/place/details/json?place_id=...&key=<placeholder>&...
//
// Auth note:
//   The library cannot attach a Firebase auth or App Check token to these
//   requests, so this endpoint is not per-user authenticated. Protection is:
//     1. Path allow-list (only the two Places endpoints below).
//     2. Server-side key injection (client key is ignored/stripped).
//     3. `fields` allow-list on details (bounds Google billing surface).
//     4. Input length cap.
//   Add a Google Cloud quota/rate limit on the key, and restrict the key to the
//   Places API in Cloud Console, as the primary abuse controls. To get true
//   per-user auth, pass a Firebase ID token via the library `query` prop and
//   verify it here (left out by default to avoid tokens in URL query logs).

const GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api";

// Only these subpaths may be proxied. Prevents use as an open Google proxy.
const ALLOWED_PATHS = new Set([
  "/place/autocomplete/json",
  "/place/details/json",
]);

// Bounds what Place Details can return (and bill for).
const ALLOWED_DETAIL_FIELDS =
  "geometry,formatted_address,name,address_components";

const MAX_INPUT_LENGTH = 200;

export const googlePlacesProxy = onRequest(
  { cors: true },
  async (req: Request, res: Response): Promise<void> => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      logger.error("googlePlacesProxy: GOOGLE_MAPS_API_KEY is not set");
      res.status(503).json({ error: "Location service unavailable" });
      return;
    }

    // Normalize the subpath the library appended after the function URL.
    const path = req.path.endsWith("/json")
      ? req.path
      : `${req.path.replace(/\/$/, "")}`;

    if (!ALLOWED_PATHS.has(path)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Copy client params but never trust their `key`; cap `input`; force fields.
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "key") continue;
      if (typeof v === "string") params[k] = v;
    }

    if (typeof params.input === "string") {
      params.input = params.input.slice(0, MAX_INPUT_LENGTH);
    }
    if (path === "/place/details/json") {
      params.fields = ALLOWED_DETAIL_FIELDS;
    }
    params.key = apiKey;

    try {
      const response = await Axios.get(`${GOOGLE_PLACES_BASE}${path}`, {
        params,
      });
      res.status(200).json(response.data);
    } catch (error) {
      logger.error("googlePlacesProxy upstream error", error);
      res.status(502).json({ error: "Upstream location service error" });
    }
  },
);
