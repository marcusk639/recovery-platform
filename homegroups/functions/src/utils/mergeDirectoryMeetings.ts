import { SerializedMeeting } from "../callable/findMeetings";

const identityKeys = (m: SerializedMeeting): string[] => {
  const place = [m.lat?.toFixed(3), m.lng?.toFixed(3)].join(",");
  const content = [m.type, m.name.trim().toLowerCase(), m.day, m.time, place];
  return [
    ...(m.apiId ? [`upstream|${m.type}|${m.apiId}`] : []),
    `content|${content.join("|")}`,
  ];
};

/** Scraped rows are frozen copies. Members' rows and group links hold data the directory lacks. */
const isReplaceable = (m: SerializedMeeting): boolean =>
  m.addedBy === "system" && !m.groupId;

/**
 * Combine Homegroups' own meetings with the shared directory's, listing each meeting
 * once. Homegroups' document ids use a different recipe, so ids can't match them.
 */
export function mergeDirectoryMeetings(
  own: readonly SerializedMeeting[],
  directory: readonly SerializedMeeting[],
): SerializedMeeting[] {
  const merged = [...own];
  const positionByKey = new Map<string, number>();
  const remember = (m: SerializedMeeting, position: number) => {
    for (const key of identityKeys(m)) {
      if (!positionByKey.has(key)) positionByKey.set(key, position);
    }
  };
  merged.forEach(remember);

  for (const meeting of directory) {
    const match = identityKeys(meeting)
      .map((key) => positionByKey.get(key))
      .find((position) => position !== undefined);

    if (match === undefined) {
      merged.push(meeting);
      remember(meeting, merged.length - 1);
    } else if (isReplaceable(merged[match])) {
      merged[match] = meeting;
      remember(meeting, match);
    }
  }
  return merged;
}
