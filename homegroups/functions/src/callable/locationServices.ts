import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Axios from "axios";
import { requireAuth } from "../utils/callableWrapper";

// Reverse-geocode proxy callable.
//
// The mobile client reverse-geocodes (lat/lng -> address) when the user taps
// "Use current location" or drags the map pin. Routing it through this callable
// keeps the Google Maps web-services key out of the app bundle — the key lives
// only in Cloud Secret Manager (GOOGLE_MAPS_API_KEY, bound via the `secrets:`
// list in index.ts). Requires an authenticated caller.
//
// Places autocomplete + place details are handled separately by the
// googlePlacesProxy HTTP function, because the autocomplete library calls them
// directly and cannot use a callable.
//
// NOTE: the native map-render key (react-native-maps / PROVIDER_GOOGLE) is a
// separate, unavoidably-client-side key configured in AndroidManifest.xml and
// the iOS AppDelegate. It must be locked down via Google Cloud Console
// application + API restrictions — it cannot be proxied.

const MAPS_BASE = "https://maps.googleapis.com/maps/api";

interface ReverseGeocodeData {
  latitude: number;
  longitude: number;
}

export const reverseGeocodeLocation = onCall(
  async (request: CallableRequest<ReverseGeocodeData>) => {
    requireAuth(request);

    const { latitude, longitude } = request.data || ({} as ReverseGeocodeData);
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new HttpsError(
        "invalid-argument",
        "latitude and longitude must be numbers.",
      );
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      logger.error("reverseGeocodeLocation: GOOGLE_MAPS_API_KEY is not set");
      throw new HttpsError("internal", "Location service is unavailable.");
    }

    try {
      const response = await Axios.get(`${MAPS_BASE}/geocode/json`, {
        params: { latlng: `${latitude},${longitude}`, key },
      });
      return { results: response.data?.results ?? [] };
    } catch (error) {
      logger.error("reverseGeocodeLocation failed", error);
      throw new HttpsError("internal", "Unable to look up that location.");
    }
  },
);
