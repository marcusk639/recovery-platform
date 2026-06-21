import { daysOfWeek } from "./date";
import {
  DirectoryMeeting,
  DirectoryProvider,
} from "../entities/DirectoryMeeting";
import { SerializedMeeting } from "../callable/findMeetings";

/** Map recovery-api directory providers onto homegroups' client-facing meeting types. */
const PROVIDER_TO_TYPE: Record<DirectoryProvider, string> = {
  AA: "AA",
  NA: "NA",
  CELEBRATE_RECOVERY: "Celebrate Recovery",
  CUSTOM: "Custom",
};

/**
 * Map a shared-directory meeting into homegroups' `SerializedMeeting` client
 * contract.
 *
 * Field-for-field translation only — keeps mobile/web untouched. The directory's
 * integer `day` (0–6) becomes homegroups' lowercase weekday string; `provider`
 * becomes the client `type`. The directory exposes no timestamps, so `createdAt`
 * / `updatedAt` are emitted as empty strings (deterministic for tests; the
 * client treats these as informational only for directory-sourced rows).
 */
export function mapDirectoryToSerialized(
  meeting: DirectoryMeeting,
): SerializedMeeting {
  return {
    id: meeting.id,
    name: meeting.name ?? "",
    time: meeting.time ?? "",
    format: meeting.format ?? "",
    type: PROVIDER_TO_TYPE[meeting.provider] ?? "",
    verified: false,
    addedBy: "",
    createdAt: "",
    updatedAt: "",
    address: meeting.location?.address,
    street: meeting.location?.address,
    city: meeting.location?.city,
    state: meeting.location?.state,
    zip: meeting.location?.zip,
    lat: meeting.location?.lat,
    lng: meeting.location?.lng,
    geohash: meeting.location?.geohash,
    day: typeof meeting.day === "number" ? daysOfWeek[meeting.day] : undefined,
    online: meeting.online,
    link: meeting.link,
    onlineNotes: meeting.onlineNotes,
  };
}
