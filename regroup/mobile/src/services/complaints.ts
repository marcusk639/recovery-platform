import * as crud from "./crud";
import { firestore } from "../../firebase-setup";
import { House } from "../entities/House";
import cloneDeep from "lodash/cloneDeep";
import { Complaint } from "../entities/Complaint";

const complaintsCollection = firestore.collection("complaints");
const houseCollection = firestore.collection("houses");

export const createComplaint = (complaint: Complaint) => {
  return crud.create<Complaint>(complaintsCollection, complaint, complaint.id);
};

export const removeComplaint = async (_house: House, complaint: Complaint) => {
  const batch = firestore.batch();
  const complaints = cloneDeep(_house.complaints);
  delete complaints[complaint.id];
  const house: House = { ..._house, complaints: { ...complaints } };
  // Hardened 2026-07-05: batch.set() rewrote the same complaint document back
  // instead of deleting it — "Remove" disappeared the item from the house's
  // embedded list view but the standalone collection doc persisted untouched.
  // Also scoped the house update to just the changed field instead of
  // blind-writing the full client-side house snapshot, which risked
  // clobbering concurrent edits from other admins.
  batch.delete(complaintsCollection.doc(complaint.id));
  batch.update(houseCollection.doc(house.id), { complaints: house.complaints });
  await batch.commit();
  return house;
};
