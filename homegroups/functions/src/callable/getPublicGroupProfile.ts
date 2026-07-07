import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { enforceRateLimit, callerKey } from "../utils/rateLimit";

interface GetPublicGroupProfileData {
  groupId: string;
}

export interface PublicMeeting {
  day?: string;
  time?: string;
  format?: string;
  locationName?: string;
  isOnline: boolean;
}

export interface PublicGroupProfile {
  id: string;
  name: string;
  type: string;
  description?: string; // only present when isClaimed
  placeName?: string;
  city?: string;
  state?: string;
  isClaimed: boolean;
  meetings: PublicMeeting[];
}

function pickMeeting(m: Record<string, unknown>): PublicMeeting {
  return {
    day: typeof m.day === "string" ? m.day : undefined,
    time: typeof m.time === "string" ? m.time : undefined,
    format: typeof m.format === "string" ? m.format : undefined,
    locationName:
      typeof m.locationName === "string" ? m.locationName : undefined,
    isOnline: m.online === true,
  };
}

async function getPublicGroupProfileHandler(
  request: CallableRequest<GetPublicGroupProfileData>,
): Promise<PublicGroupProfile> {
  await enforceRateLimit(`getPublicGroupProfile:${callerKey(request)}`);

  const { groupId } = request.data || ({} as GetPublicGroupProfileData);

  if (!groupId) {
    throw new HttpsError("invalid-argument", "groupId is required.");
  }

  try {
    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const data = snap.data() || {};

    // Opt-out model confirmed by spec (docs/superpowers/specs/2026-04-14-public-group-page-design.md):
    // groups default to publicly visible. Admins can set publicProfileEnabled=false to hide.
    // Do NOT change to `=== true` — that would hide all pre-seeded groups.
    const publicEnabled = data.publicProfileEnabled ?? true;
    if (publicEnabled === false) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const isClaimed = data.isClaimed === true;
    let meetings: Record<string, unknown>[] = Array.isArray(data.meetings)
      ? data.meetings
      : [];

    // Fallback for pre-seeded scraped groups: their group.meetings[] is empty
    // but real meeting data lives in the top-level `meetings` collection keyed
    // by groupId. Query for up to 10 to keep the page fast.
    if (meetings.length === 0) {
      const meetingsSnap = await db
        .collection("meetings")
        .where("groupId", "==", snap.id)
        .limit(10)
        .get();
      meetings = meetingsSnap.docs.map(
        (d) => d.data() as Record<string, unknown>,
      );
    }

    const profile: PublicGroupProfile = {
      id: snap.id,
      name: data.name ?? "",
      type: data.type ?? "",
      placeName: data.placeName,
      city: data.city,
      state: data.state,
      isClaimed,
      meetings: meetings.map(pickMeeting),
    };

    if (isClaimed && data.description) {
      profile.description = data.description;
    }

    return profile;
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    logger.error("getPublicGroupProfile failed", err);
    throw new HttpsError("internal", "Unable to load group profile.");
  }
}

export const getPublicGroupProfile = onCall(getPublicGroupProfileHandler);
