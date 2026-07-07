/**
 * Oxford House Service — barrel export
 *
 * Delegates to subcollection-based modules that use houses/{houseId}/... paths.
 * All data lives in subcollections for proper Firestore security rule coverage.
 *
 * IMPORTANT: Do NOT use flat top-level collections (e.g., firestore.collection('officers')).
 * Firestore security rules only protect the subcollection paths.
 */

import { firestore } from "../../../firebase-setup";
import { logException } from "../../util/logging";
import {
  Officer,
  BusinessMeeting,
  Vote,
  Election,
  EESTransaction,
  FinancialRecord,
} from "../../entities/oxford";

// NOTE: Screen components import directly from subcollection modules
// (e.g., import { castVote } from '../../services/oxford/votes').
// This barrel provides adapter functions for the React Query layer
// (oxfordQueries.ts) that match the original flat-collection signatures.

// ─── Officers (adapter — delegates to subcollection module) ─────────────────

export async function getOfficers(houseId: string): Promise<Officer[]> {
  try {
    const snapshot = await firestore
      .collection("houses")
      .doc(houseId)
      .collection("officers")
      .get();
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id } as Officer)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load officers");
  }
}

export async function getActiveOfficers(houseId: string): Promise<Officer[]> {
  try {
    const snapshot = await firestore
      .collection("houses")
      .doc(houseId)
      .collection("officers")
      .where("isActive", "==", true)
      .get();
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id } as Officer)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load active officers");
  }
}

export async function createOfficer(
  officer: Omit<Officer, "id">
): Promise<Officer> {
  try {
    const ref = firestore
      .collection("houses")
      .doc(officer.houseId)
      .collection("officers")
      .doc();
    const newOfficer: Officer = { ...officer, id: ref.id };
    await ref.set(newOfficer);
    return newOfficer;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create officer");
  }
}

export async function updateOfficer(
  id: string,
  updates: Partial<Officer> & { houseId?: string }
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error("houseId required to update officer in subcollection");
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("officers")
      .doc(id)
      .update(updates);
  } catch (error) {
    logException(error);
    throw new Error("Failed to update officer");
  }
}

export async function removeOfficer(
  id: string,
  houseId?: string
): Promise<void> {
  if (!houseId) {
    throw new Error("houseId required to remove officer from subcollection");
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("officers")
      .doc(id)
      .delete();
  } catch (error) {
    logException(error);
    throw new Error("Failed to remove officer");
  }
}

// ─── Business Meetings (adapter — uses subcollection path) ──────────────────

export async function getBusinessMeetings(
  houseId: string,
  limit?: number
): Promise<BusinessMeeting[]> {
  try {
    let query: any = firestore
      .collection("houses")
      .doc(houseId)
      .collection("business-meetings")
      .orderBy("scheduledDate", "desc");
    if (limit) query = query.limit(limit);
    const result = await query.get();
    return result.docs.map(
      (doc: any) => ({ ...doc.data(), id: doc.id } as BusinessMeeting)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load business meetings");
  }
}

export async function createBusinessMeeting(
  meeting: Omit<BusinessMeeting, "id">
): Promise<BusinessMeeting> {
  try {
    const ref = firestore
      .collection("houses")
      .doc(meeting.houseId)
      .collection("business-meetings")
      .doc();
    const newMeeting: BusinessMeeting = { ...meeting, id: ref.id };
    await ref.set(newMeeting);
    return newMeeting;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create business meeting");
  }
}

export async function updateBusinessMeeting(
  id: string,
  updates: Partial<BusinessMeeting> & { houseId?: string }
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error(
      "houseId required to update business meeting in subcollection"
    );
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("business-meetings")
      .doc(id)
      .update(updates);
  } catch (error) {
    logException(error);
    throw new Error("Failed to update business meeting");
  }
}

export async function deleteBusinessMeeting(
  id: string,
  houseId?: string
): Promise<void> {
  if (!houseId) {
    throw new Error(
      "houseId required to delete business meeting from subcollection"
    );
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("business-meetings")
      .doc(id)
      .delete();
  } catch (error) {
    logException(error);
    throw new Error("Failed to delete business meeting");
  }
}

// ─── Votes (adapter — uses subcollection path) ─────────────────────────────
//
// NOTE: there used to be a `castVote(vote)` here that just created/overwrote
// a vote document — despite the name, it behaved like `createVote`, not like
// "cast a ballot," and critically did NOT check `vote.isAnonymous` before
// writing. It was wired to a `useCastVote()` hook in oxfordQueries.ts that
// no live screen ever called (confirmed by searching every call site — only
// this file's own tests and that hook's tests referenced it). Removed
// 2026-07-04 as dead-code cleanup: the real, live vote-casting path is
// `castVote(houseId, voteId, guestId, choice)` in `./votes.ts`, used via
// `useCastHouseVote()` in oxfordQueries.ts and called from Voting.tsx. That
// function correctly skips writing `individualVotes` when a vote is
// anonymous — anonymous votes were never actually broken in production,
// this dead duplicate was just a confusing, unused landmine sitting next to
// the real implementation.

export async function getVotesForMeeting(
  meetingId: string,
  houseId?: string
): Promise<Vote[]> {
  if (!houseId) {
    // Fallback: search across all houses (less efficient but backward compatible)
    // TODO: All callers should provide houseId for subcollection queries
    throw new Error("houseId required to query votes in subcollection");
  }
  try {
    const snapshot = await firestore
      .collection("houses")
      .doc(houseId)
      .collection("votes")
      .where("meetingId", "==", meetingId)
      .get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Vote));
  } catch (error) {
    logException(error);
    throw new Error("Failed to load votes");
  }
}

export async function updateVote(
  id: string,
  updates: Partial<Vote> & { houseId?: string }
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error("houseId required to update vote in subcollection");
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("votes")
      .doc(id)
      .update(updates);
  } catch (error) {
    logException(error);
    throw new Error("Failed to update vote");
  }
}

// ─── Elections (subcollection path) ─────────────────────────────────────────

export async function getElections(houseId: string): Promise<Election[]> {
  try {
    const snapshot = await firestore
      .collection("houses")
      .doc(houseId)
      .collection("elections")
      .orderBy("conductedAt", "desc")
      .get();
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id } as Election)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load elections");
  }
}

export async function createElection(
  election: Omit<Election, "id">
): Promise<Election> {
  try {
    const ref = firestore
      .collection("houses")
      .doc(election.houseId)
      .collection("elections")
      .doc();
    const newElection: Election = { ...election, id: ref.id };
    await ref.set(newElection);
    return newElection;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create election");
  }
}

export async function updateElection(
  id: string,
  updates: Partial<Election> & { houseId?: string }
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error("houseId required to update election in subcollection");
  }
  try {
    await firestore
      .collection("houses")
      .doc(houseId)
      .collection("elections")
      .doc(id)
      .update(updates);
  } catch (error) {
    logException(error);
    throw new Error("Failed to update election");
  }
}

// ─── EES Transactions (uses top-level ees-records — matches existing rules) ─

export async function getEESTransactions(
  houseId: string
): Promise<EESTransaction[]> {
  try {
    const snapshot = await firestore
      .collection("ees-records")
      .where("houseId", "==", houseId)
      .orderBy("createdAt", "desc")
      .get();
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id } as EESTransaction)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load EES transactions");
  }
}

export async function createEESTransaction(
  tx: Omit<EESTransaction, "id">
): Promise<EESTransaction> {
  try {
    const ref = firestore.collection("ees-records").doc();
    const newTx: EESTransaction = { ...tx, id: ref.id };
    await ref.set(newTx);
    return newTx;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create EES transaction");
  }
}

// ─── Financial Records (subcollection path) ─────────────────────────────────

export async function getFinancialRecords(
  houseId: string
): Promise<FinancialRecord[]> {
  try {
    const snapshot = await firestore
      .collection("houses")
      .doc(houseId)
      .collection("financial-records")
      .orderBy("period", "desc")
      .get();
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id } as FinancialRecord)
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load financial records");
  }
}

export async function createFinancialRecord(
  record: Omit<FinancialRecord, "id">
): Promise<FinancialRecord> {
  try {
    const ref = firestore
      .collection("houses")
      .doc(record.houseId)
      .collection("financial-records")
      .doc();
    const newRecord: FinancialRecord = { ...record, id: ref.id };
    await ref.set(newRecord);
    return newRecord;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create financial record");
  }
}
