import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Axios from "axios";

// Google Maps web-service proxy callables.
//
// These exist so the mobile client never ships a Google Maps web-services key
// in its JS bundle. The key lives only in Cloud Secret Manager
// (GOOGLE_MAPS_API_KEY, bound via the `secrets: [...]` list in index.ts) and is
// read here at runtime. All three callables require an authenticated caller.
//
// NOTE: the native map-render key (react-native-maps / PROVIDER_GOOGLE) is a
// separate, unavoidably-client-side key configured in AndroidManifest.xml and
// the iOS AppDelegate. It must be locked down via Google Cloud Console
// application + API restrictions — it cannot be proxied.

const MAPS_BASE = "https://maps.googleapis.com/maps/api";

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    // Surfaced as an internal error — never leak the missing-config detail to the client.
    logger.error("GOOGLE_MAPS_API_KEY is not set");
    throw new HttpsError("internal", "Location service is unavailable.");
  }
  return key;
}

function requireAuth(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }
}

interface ReverseGeocodeData {
  latitude: number;
  longitude: number;
}

/**
 * reverseGeocodeLocation: lat/lng -> Google geocode results.
 * Returns the raw `results` array so the client keeps its existing parsing.
 */
export const reverseGeocodeLocation = onCall(
  async (request: CallableRequest<ReverseGeocodeData>) => {
    requireAuth(request);
    const { latitude, longitude } = request.data || ({} as ReverseGeocodeData);

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "latitude and longitude must be numbers."
      );
    }

    const key = getApiKey();
    try {
      const response = await Axios.get(`${MAPS_BASE}/geocode/json`, {
        params: { latlng: `${latitude},${longitude}`, key },
      });
      return { results: response.data?.results ?? [] };
    } catch (error) {
      logger.error("reverseGeocodeLocation failed", error);
      throw new HttpsError("internal", "Unable to look up that location.");
    }
  }
);

interface PlacesAutocompleteData {
  input: string;
  sessionToken?: string;
}

/**
 * placesAutocomplete: free-text input -> address predictions.
 * Returns the raw `predictions` array (description + place_id).
 */
export const placesAutocomplete = onCall(
  async (request: CallableRequest<PlacesAutocompleteData>) => {
    requireAuth(request);
    const { input, sessionToken } =
      request.data || ({} as PlacesAutocompleteData);

    if (typeof input !== "string" || input.trim().length < 2) {
      throw new HttpsError(
        "invalid-argument",
        "input must be at least 2 characters."
      );
    }

    const key = getApiKey();
    try {
      const response = await Axios.get(`${MAPS_BASE}/place/autocomplete/json`, {
        params: {
          input: input.trim(),
          types: "address",
          language: "en",
          key,
          ...(sessionToken ? { sessiontoken: sessionToken } : {}),
        },
      });
      return { predictions: response.data?.predictions ?? [] };
    } catch (error) {
      logger.error("placesAutocomplete failed", error);
      throw new HttpsError("internal", "Unable to search for locations.");
    }
  }
);

interface PlaceDetailsData {
  placeId: string;
  sessionToken?: string;
}

/**
 * placeDetails: place_id -> geometry + formatted_address + name.
 */
export const placeDetails = onCall(
  async (request: CallableRequest<PlaceDetailsData>) => {
    requireAuth(request);
    const { placeId, sessionToken } = request.data || ({} as PlaceDetailsData);

    if (typeof placeId !== "string" || placeId.length === 0) {
      throw new HttpsError("invalid-argument", "placeId is required.");
    }

    const key = getApiKey();
    try {
      const response = await Axios.get(`${MAPS_BASE}/place/details/json`, {
        params: {
          place_id: placeId,
          fields: "geometry,formatted_address,name,address_components",
          key,
          ...(sessionToken ? { sessiontoken: sessionToken } : {}),
        },
      });
      return { result: response.data?.result ?? null };
    } catch (error) {
      logger.error("placeDetails failed", error);
      throw new HttpsError("internal", "Unable to load location details.");
    }
  }
);
