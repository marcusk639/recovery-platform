import { SerializedMeeting } from "../callable/findMeetings";

const upstreamKey = (m: SerializedMeeting): string | null =>
  m.apiId ? `${m.type}|${m.apiId}` : null;

const contentKey = (m: SerializedMeeting): string => {
  const place = [m.lat?.toFixed(3), m.lng?.toFixed(3)].join(",");
  return [m.type, m.name.trim().toLowerCase(), m.day, m.time, place].join("|");
};

/** Scraped rows are frozen copies. Members' rows and group links hold data the directory lacks. */
const isRefreshable = (m: SerializedMeeting): boolean =>
  m.addedBy === "system" && !m.groupId;

const REFRESHED_FIELDS = [
  "name",
  "time",
  "day",
  "format",
  "timezone",
  "address",
  "street",
  "city",
  "state",
  "zip",
  "lat",
  "lng",
  "geohash",
  "dataAsOf",
] as const;

/**
 * The scraped row keeps its id, because members' favourites point at it, and the fields
 * only Homegroups has. A blank from the directory doesn't erase what's known, except for
 * online details, where having none means the meeting no longer has them.
 */
function refreshFromDirectory(
  own: SerializedMeeting,
  directory: SerializedMeeting,
): SerializedMeeting {
  const refreshed = Object.fromEntries(
    REFRESHED_FIELDS.map((field) => [field, directory[field]]).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
  return {
    ...own,
    ...refreshed,
    online: directory.online,
    link: directory.link,
    onlineNotes: directory.onlineNotes,
  };
}

/**
 * Combine Homegroups' own meetings with the shared directory's, listing each meeting
 * once. Homegroups' document ids use a different recipe, so ids can't match them.
 *
 * Looking alike only pairs a directory row with one of Homegroups' rows, and never when
 * both have upstream ids. Two directory rows that look alike are separate listings, such
 * as one group's two Zoom rooms.
 */
export function mergeDirectoryMeetings(
  own: readonly SerializedMeeting[],
  directory: readonly SerializedMeeting[],
): SerializedMeeting[] {
  const merged = [...own];
  const byUpstream = new Map<string, number>();
  const byContent = new Map<string, number>();
  own.forEach((m, position) => {
    const upstream = upstreamKey(m);
    if (upstream && !byUpstream.has(upstream)) {
      byUpstream.set(upstream, position);
    }
    if (!byContent.has(contentKey(m))) byContent.set(contentKey(m), position);
  });

  const paired = new Set<number>();
  for (const meeting of directory) {
    const upstream = upstreamKey(meeting);
    let match = upstream ? byUpstream.get(upstream) : undefined;
    if (match === undefined) {
      const lookalike = byContent.get(contentKey(meeting));
      const canPair =
        lookalike !== undefined &&
        !paired.has(lookalike) &&
        !(merged[lookalike].apiId && meeting.apiId);
      if (canPair) match = lookalike;
    }

    if (match === undefined) {
      merged.push(meeting);
      if (upstream) byUpstream.set(upstream, merged.length - 1);
      continue;
    }
    paired.add(match);
    if (isRefreshable(merged[match])) {
      merged[match] = refreshFromDirectory(merged[match], meeting);
    }
  }
  return merged;
}
