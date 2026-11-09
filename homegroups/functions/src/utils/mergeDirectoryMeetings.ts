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
  const moved = Boolean(directory.address) && directory.address !== own.address;
  return {
    ...own,
    ...refreshed,
    ...(moved ? { formattedAddress: undefined } : {}),
    online: directory.online,
    link: directory.link,
    onlineNotes: directory.onlineNotes,
  };
}

/**
 * Combine Homegroups' own meetings with the shared directory's, listing each meeting
 * once. Homegroups' document ids use a different recipe, so ids can't match them.
 *
 * Upstream ids are matched first, so a look-alike can't take a row its true match needs.
 * Looking alike then pairs a directory row with one of Homegroups' rows, once per row. If
 * both have upstream ids, that happens only for a scraped row, whose id may be retired.
 * Two directory rows that look alike are separate listings, such as two Zoom rooms.
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
  const pair = (position: number, meeting: SerializedMeeting) => {
    paired.add(position);
    // A dated row is a frozen snapshot, which may be older than Homegroups' own copy.
    if (isRefreshable(merged[position]) && !meeting.dataAsOf) {
      merged[position] = refreshFromDirectory(merged[position], meeting);
    }
  };

  const unmatched: SerializedMeeting[] = [];
  for (const meeting of directory) {
    const upstream = upstreamKey(meeting);
    const match = upstream ? byUpstream.get(upstream) : undefined;
    if (match === undefined) unmatched.push(meeting);
    else pair(match, meeting);
  }

  for (const meeting of unmatched) {
    const upstream = upstreamKey(meeting);
    if (upstream && byUpstream.has(upstream)) continue;

    const lookalike = byContent.get(contentKey(meeting));
    const canPair =
      lookalike !== undefined &&
      !paired.has(lookalike) &&
      (!(merged[lookalike].apiId && meeting.apiId) ||
        isRefreshable(merged[lookalike]));
    let position: number;
    if (canPair) {
      position = lookalike;
      pair(lookalike, meeting);
    } else {
      position = merged.push(meeting) - 1;
    }
    if (upstream) byUpstream.set(upstream, position);
  }
  return merged;
}
