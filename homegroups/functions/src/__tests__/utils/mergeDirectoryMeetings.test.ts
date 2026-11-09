import { mergeDirectoryMeetings } from "../../utils/mergeDirectoryMeetings";
import { SerializedMeeting } from "../../callable/findMeetings";

function meeting(over: Partial<SerializedMeeting> = {}): SerializedMeeting {
  return {
    id: "m",
    name: "Sunrise Group",
    time: "07:00",
    format: "",
    type: "AA",
    verified: false,
    addedBy: "",
    createdAt: "",
    updatedAt: "",
    day: "tuesday",
    lat: 30.267153,
    lng: -97.743057,
    ...over,
  };
}
const ids = (rows: SerializedMeeting[]) => rows.map((m) => m.id).sort();

describe("mergeDirectoryMeetings", () => {
  it("keeps meetings found in only one source", () => {
    const merged = mergeDirectoryMeetings(
      [meeting({ id: "own", name: "Own" })],
      [meeting({ id: "dir", name: "Directory" })],
    );
    expect(ids(merged)).toEqual(["dir", "own"]);
  });

  it("replaces a scraped copy with the directory's fresher one, matched by upstream id", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      time: "07:00",
    });
    const fresh = meeting({ id: "dir", apiId: "77", time: "08:00" });
    const merged = mergeDirectoryMeetings([own], [fresh]);
    expect(ids(merged)).toEqual(["dir"]);
    expect(merged[0].time).toBe("08:00");
  });

  it("matches on name, day, time and place when upstream ids are missing", () => {
    const own = meeting({
      id: "own",
      name: " SUNRISE group ",
      addedBy: "system",
    });
    const dir = meeting({ id: "dir", lat: 30.2671, lng: -97.7431 });
    expect(ids(mergeDirectoryMeetings([own], [dir]))).toEqual(["dir"]);
  });

  it("keeps a meeting a member added, rather than replacing it", () => {
    const own = meeting({ id: "own", apiId: "77", addedBy: "user-1" });
    const dir = meeting({ id: "dir", apiId: "77" });
    expect(ids(mergeDirectoryMeetings([own], [dir]))).toEqual(["own"]);
  });

  it("keeps a scraped meeting attached to a group, because the app links through it", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      groupId: "g1",
    });
    const dir = meeting({ id: "dir", apiId: "77" });
    expect(ids(mergeDirectoryMeetings([own], [dir]))).toEqual(["own"]);
  });

  it.each([
    ["different day", { day: "wednesday" }],
    ["different time", { time: "07:30" }],
    ["different place", { lat: 30.5 }],
    ["different fellowship", { type: "NA" }],
  ])("treats a %s as a separate meeting", (_name, change) => {
    const merged = mergeDirectoryMeetings(
      [meeting({ id: "own", addedBy: "system" })],
      [meeting({ id: "dir", ...change })],
    );
    expect(ids(merged)).toEqual(["dir", "own"]);
  });

  it("collapses two directory rows that match the same Homegroups meeting", () => {
    const own = meeting({ id: "own", apiId: "77", addedBy: "system" });
    const merged = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "a", apiId: "77" }), meeting({ id: "b", apiId: "77" })],
    );
    expect(ids(merged)).toEqual(["a"]);
  });
});
