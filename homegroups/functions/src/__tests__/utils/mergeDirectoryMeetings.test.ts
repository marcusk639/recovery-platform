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

  it("refreshes a scraped copy from the directory, matched by upstream id", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      time: "07:00",
    });
    const fresh = meeting({ id: "dir", apiId: "77", time: "08:00" });
    const merged = mergeDirectoryMeetings([own], [fresh]);
    expect(ids(merged)).toEqual(["own"]);
    expect(merged[0].time).toBe("08:00");
  });

  it("keeps a scraped meeting's id, so members' favourites still match it", () => {
    const own = meeting({ id: "own", apiId: "77", addedBy: "system" });
    const merged = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "dir", apiId: "77" })],
    );
    expect(merged[0].id).toBe("own");
  });

  it("keeps fields only Homegroups has when it refreshes a scraped meeting", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      locationName: "St. Mark's Hall",
      notes: "Side door",
      locationNotes: "Parking in back",
      groupName: "Sunrise",
      verified: true,
    });
    const [merged] = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "dir", apiId: "77", time: "08:00" })],
    );
    expect(merged).toMatchObject({
      locationName: "St. Mark's Hall",
      notes: "Side door",
      locationNotes: "Parking in back",
      groupName: "Sunrise",
      verified: true,
      addedBy: "system",
    });
  });

  it("does not blank a field the directory has no value for", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      format: "Open",
      city: "Austin",
    });
    const [merged] = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "dir", apiId: "77", format: "", city: undefined })],
    );
    expect(merged.format).toBe("Open");
    expect(merged.city).toBe("Austin");
  });

  it("clears an online link when the directory says the meeting no longer has one", () => {
    const own = meeting({
      id: "own",
      apiId: "77",
      addedBy: "system",
      online: true,
      link: "https://zoom.example/old",
      onlineNotes: "Password 1234",
    });
    const [merged] = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "dir", apiId: "77" })],
    );
    expect(merged.online).toBeUndefined();
    expect(merged.link).toBeUndefined();
    expect(merged.onlineNotes).toBeUndefined();
  });

  it("matches on name, day, time and place when upstream ids are missing", () => {
    const own = meeting({
      id: "own",
      name: " SUNRISE group ",
      addedBy: "system",
    });
    const dir = meeting({ id: "dir", lat: 30.2671, lng: -97.7431 });
    expect(ids(mergeDirectoryMeetings([own], [dir]))).toEqual(["own"]);
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
    expect(ids(merged)).toEqual(["own"]);
  });

  it("keeps directory meetings that look alike but are separate listings", () => {
    const merged = mergeDirectoryMeetings(
      [],
      [
        meeting({ id: "a", apiId: "1", link: "https://zoom.example/a" }),
        meeting({ id: "b", apiId: "2", link: "https://zoom.example/b" }),
      ],
    );
    expect(ids(merged)).toEqual(["a", "b"]);
  });

  it("keeps look-alike directory rows with no upstream id at all", () => {
    const merged = mergeDirectoryMeetings(
      [],
      [meeting({ id: "a" }), meeting({ id: "b" })],
    );
    expect(ids(merged)).toEqual(["a", "b"]);
  });

  it("lets only one look-alike directory row match a Homegroups meeting", () => {
    const own = meeting({ id: "own", addedBy: "system" });
    const merged = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "a", apiId: "1" }), meeting({ id: "b", apiId: "2" })],
    );
    expect(ids(merged)).toEqual(["b", "own"]);
  });

  it("treats rows with different upstream ids as separate, even when they look alike", () => {
    const own = meeting({ id: "own", apiId: "1", addedBy: "system" });
    const merged = mergeDirectoryMeetings(
      [own],
      [meeting({ id: "dir", apiId: "2" })],
    );
    expect(ids(merged)).toEqual(["dir", "own"]);
  });
});
