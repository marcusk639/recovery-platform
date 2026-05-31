import { getQueriesForDocumentsAround } from "../utils/meetings";
import { db } from "../utils/firebase";

export const meetingCollection = db.collection("meetings");

/**
 * Gets houses where attribute == value
 * @param {*} attribute The attribute to select by
 */
export async function getMeetingsWhere(attribute: string, value: string) {
  return meetingCollection.where(attribute, "==", value).get();
}

export async function getNaMeetings(
  lat: any,
  lng: any,
  distance: number,
  day?: string
) {
  const queries = getQueriesForDocumentsAround(
    db.collection("na-meetings"),
    { lat, lon: lng },
    10,
    day
  );
  let results = queries.map((q) => q.get());
  const meetings = [];
  results = await Promise.all(results);
  results.forEach((r) => {
    meetings.push(...r.docs.map((d) => d.data()));
  });
  return meetings;
  // if (day) {
  //   return ratsFirestore
  //     .collection('na-meetings')
  //     .where('day', '==', day)
  //     .where('gehoash', '>=', range.lower)
  //     .where('gehoash', '<=', range.upper).get();
  // } else {
  //   return ratsFirestore
  //     .collection('na-meetings')
  //     .where('gehoash', '>=', range.lower)
  //     .where('gehoash', '<=', range.upper).get();
  // }
}
