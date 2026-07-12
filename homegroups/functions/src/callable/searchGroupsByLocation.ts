import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as geofire from "geofire-common";
import { Query } from "firebase-admin/firestore"; // Firestore types if needed
import { MeetingType } from "../entities/Meeting"; // Assuming MeetingType is defined here
import { requireAuth } from "../utils/callableWrapper";

// Define the expected input data structure
interface SearchGroupsData {
  lat: number;
  lng: number;
  radius: number; // Expect radius in kilometers
  type?: MeetingType; // Optional filter by meeting type
}

export interface PublicSearchResult {
  id: string;
  name: string;
  type: string;
  placeName?: string;
  city?: string;
  state?: string;
  isClaimed: boolean;
  distanceInM: number;
}

function pickPublicSearchFields(
  groupData: Record<string, unknown>,
  id: string,
  distanceInM: number,
): PublicSearchResult {
  return {
    id,
    name: (groupData.name as string) ?? "",
    type: (groupData.type as string) ?? "",
    placeName: groupData.placeName as string | undefined,
    city: groupData.city as string | undefined,
    state: groupData.state as string | undefined,
    isClaimed: groupData.isClaimed === true,
    distanceInM,
  };
}

/**
 * Calculates the distance between two coordinates in meters using geofire.
 */
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  // geofire.distanceBetween returns meters
  return geofire.distanceBetween([lat1, lon1], [lat2, lon2]);
}

/**
 * Searches for groups within a specified radius of a location using geohashing.
 */
export const searchGroupsByLocation = onCall(
  async (request: CallableRequest<SearchGroupsData>) => {
    const { lat, lng, radius, type } = request.data;
    const userId = requireAuth(request); // Authenticated user ID

    // Validate required parameters
    if (lat === undefined || lng === undefined || radius === undefined) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required parameters: latitude, longitude, and radius (in km).",
      );
    }

    // Basic validation for coordinate ranges and radius
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid latitude or longitude provided.",
      );
    }
    if (radius <= 0 || radius > 500) {
      // Set a reasonable max radius (e.g., 500 km)
      throw new HttpsError(
        "invalid-argument",
        "Invalid search radius provided (must be > 0 and <= 500 km).",
      );
    }

    try {
      const latitude = Number(lat);
      const longitude = Number(lng);
      const radiusInM = Number(radius) * 1000; // Convert km to meters for geofire

      // Define the center point for the query
      const center: [number, number] = [latitude, longitude];

      // Calculate the geohash query bounds
      const bounds = geofire.geohashQueryBounds(center, radiusInM);
      const promises = [];

      // Base query
      let groupsQuery: Query = db.collection("groups");

      // Apply type filter if provided
      if (type) {
        groupsQuery = groupsQuery.where("type", "==", type);
      }

      // Create a Firestore query for each bound
      for (const b of bounds) {
        const q = groupsQuery.orderBy("geohash").startAt(b[0]).endAt(b[1]);
        promises.push(q.get());
      }

      // Execute all queries in parallel
      const snapshots = await Promise.all(promises);
      const matchingGroups: PublicSearchResult[] = [];

      // Process results from all queries
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const groupData = doc.data();
          const groupLat = groupData?.lat;
          const groupLng = groupData?.lng;

          // Ensure the group has valid coordinates
          if (groupLat !== undefined && groupLng !== undefined) {
            const distanceInM = calculateDistanceMeters(
              latitude,
              longitude,
              groupLat,
              groupLng,
            );

            if (distanceInM <= radiusInM) {
              const publicEnabled = groupData?.publicProfileEnabled ?? true;
              if (publicEnabled !== false) {
                matchingGroups.push(
                  pickPublicSearchFields(
                    groupData,
                    doc.id,
                    Math.round(distanceInM),
                  ),
                );
              }
            }
          }
        }
      }

      // Remove potential duplicates that might span multiple geohash queries
      const uniqueGroups = Array.from(
        new Map(matchingGroups.map((item) => [item.id, item])).values(),
      );

      // Sort the final list by distance
      uniqueGroups.sort((a, b) => a.distanceInM - b.distanceInM);

      logger.info(`Found ${uniqueGroups.length} groups within ${radius}km.`);
      return uniqueGroups; // Return the array of matching groups
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error in searchGroupsByLocation:", error);
      throw new HttpsError(
        "internal",
        "Error searching for groups by location.",
      );
    }
  },
);
