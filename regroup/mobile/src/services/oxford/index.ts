/**
 * Oxford House Service — barrel export
 *
 * Delegates to subcollection-based modules that use houses/{houseId}/... paths.
 * All data lives in subcollections for proper Firestore security rule coverage.
 *
 * IMPORTANT: Do NOT use flat top-level collections (e.g., firestore.collection('officers')).
 * Firestore security rules only protect the subcollection paths.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "@react-native-firebase/firestore";
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
    const snapshot = await getDocs(
      collection(doc(collection(firestore, "houses"), houseId), "officers"),
    );
    return snapshot.docs.map(
      (officer) => ({ ...officer.data(), id: officer.id }) as Officer,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load officers");
  }
}

export async function getActiveOfficers(houseId: string): Promise<Officer[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(doc(collection(firestore, "houses"), houseId), "officers"),
        where("isActive", "==", true),
      ),
    );
    return snapshot.docs.map(
      (officer) => ({ ...officer.data(), id: officer.id }) as Officer,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load active officers");
  }
}

export async function createOfficer(
  officer: Omit<Officer, "id">,
): Promise<Officer> {
  try {
    const officersRef = collection(
      doc(collection(firestore, "houses"), officer.houseId),
      "officers",
    );

    // Deactivate any existing active officer holding this role first, so
    // creating a new officer never leaves two people simultaneously active
    // for the same office (e.g. two active Treasurers).
    const existingActive = await getDocs(
      query(
        officersRef,
        where("role", "==", officer.role),
        where("isActive", "==", true),
      ),
    );

    const batch = writeBatch(firestore);

    existingActive.docs.forEach((activeOfficer) => {
      batch.update(activeOfficer.ref, { isActive: false });
    });

    const ref = doc(officersRef);
    const newOfficer: Officer = { ...officer, id: ref.id };
    batch.set(ref, newOfficer);

    await batch.commit();
    return newOfficer;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create officer");
  }
}

export async function updateOfficer(
  id: string,
  updates: Partial<Officer> & { houseId?: string },
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error("houseId required to update officer in subcollection");
  }
  try {
    await updateDoc(
      doc(collection(doc(collection(firestore, "houses"), houseId), "officers"), id),
      updates,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to update officer");
  }
}

export async function removeOfficer(
  id: string,
  houseId?: string,
): Promise<void> {
  if (!houseId) {
    throw new Error("houseId required to remove officer from subcollection");
  }
  try {
    await deleteDoc(
      doc(collection(doc(collection(firestore, "houses"), houseId), "officers"), id),
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to remove officer");
  }
}

// ─── Business Meetings (adapter — uses subcollection path) ──────────────────

export async function getBusinessMeetings(
  houseId: string,
  limit?: number,
): Promise<BusinessMeeting[]> {
  try {
    const constraints: QueryConstraint[] = [orderBy("scheduledDate", "desc")];
    if (limit) constraints.push(limitTo(limit));
    const result = await getDocs(
      query(
        collection(
          doc(collection(firestore, "houses"), houseId),
          "business-meetings",
        ),
        ...constraints,
      ),
    );
    return result.docs.map(
      (meeting: any) =>
        ({ ...meeting.data(), id: meeting.id }) as BusinessMeeting,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load business meetings");
  }
}

export async function createBusinessMeeting(
  meeting: Omit<BusinessMeeting, "id">,
): Promise<BusinessMeeting> {
  try {
    const ref = doc(
      collection(
        doc(collection(firestore, "houses"), meeting.houseId),
        "business-meetings",
      ),
    );
    const newMeeting: BusinessMeeting = { ...meeting, id: ref.id };
    await setDoc(ref, newMeeting);
    return newMeeting;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create business meeting");
  }
}

export async function updateBusinessMeeting(
  id: string,
  updates: Partial<BusinessMeeting> & { houseId?: string },
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error(
      "houseId required to update business meeting in subcollection",
    );
  }
  try {
    await updateDoc(
      doc(
        collection(
          doc(collection(firestore, "houses"), houseId),
          "business-meetings",
        ),
        id,
      ),
      updates,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to update business meeting");
  }
}

export async function deleteBusinessMeeting(
  id: string,
  houseId?: string,
): Promise<void> {
  if (!houseId) {
    throw new Error(
      "houseId required to delete business meeting from subcollection",
    );
  }
  try {
    await deleteDoc(
      doc(
        collection(
          doc(collection(firestore, "houses"), houseId),
          "business-meetings",
        ),
        id,
      ),
    );
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
  houseId?: string,
): Promise<Vote[]> {
  if (!houseId) {
    // Fallback: search across all houses (less efficient but backward compatible)
    // TODO: All callers should provide houseId for subcollection queries
    throw new Error("houseId required to query votes in subcollection");
  }
  try {
    const snapshot = await getDocs(
      query(
        collection(doc(collection(firestore, "houses"), houseId), "votes"),
        where("meetingId", "==", meetingId),
      ),
    );
    return snapshot.docs.map(
      (vote) => ({ ...vote.data(), id: vote.id }) as Vote,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load votes");
  }
}

// NOTE: there used to be an `updateVote(id, updates)` here too. It had zero
// callers anywhere in src/ or in regroup/functions/src (confirmed by
// grepping every call site — only this file's own definition and a
// defensive barrel mock in BusinessMeetings.test.tsx referenced the name).
// The real security fix that mattered was tightening the Firestore rule for
// `votes/{voteId}` to deny all direct client writes — this function was
// just dead code sitting next to it. Removed 2026-07-14.

// ─── Elections (subcollection path) ─────────────────────────────────────────

export async function getElections(houseId: string): Promise<Election[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(doc(collection(firestore, "houses"), houseId), "elections"),
        orderBy("conductedAt", "desc"),
      ),
    );
    return snapshot.docs.map(
      (election) => ({ ...election.data(), id: election.id }) as Election,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load elections");
  }
}

export async function createElection(
  election: Omit<Election, "id">,
): Promise<Election> {
  try {
    const ref = doc(
      collection(
        doc(collection(firestore, "houses"), election.houseId),
        "elections",
      ),
    );
    const newElection: Election = { ...election, id: ref.id };
    await setDoc(ref, newElection);
    return newElection;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create election");
  }
}

export async function updateElection(
  id: string,
  updates: Partial<Election> & { houseId?: string },
): Promise<void> {
  const houseId = updates.houseId;
  if (!houseId) {
    throw new Error("houseId required to update election in subcollection");
  }
  try {
    await updateDoc(
      doc(collection(doc(collection(firestore, "houses"), houseId), "elections"), id),
      updates,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to update election");
  }
}

// ─── EES Transactions (uses top-level ees-records — matches existing rules) ─

export async function getEESTransactions(
  houseId: string,
): Promise<EESTransaction[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(firestore, "ees-records"),
        where("houseId", "==", houseId),
        orderBy("createdAt", "desc"),
      ),
    );
    return snapshot.docs.map(
      (tx) => ({ ...tx.data(), id: tx.id }) as EESTransaction,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load EES transactions");
  }
}

export async function createEESTransaction(
  tx: Omit<EESTransaction, "id">,
): Promise<EESTransaction> {
  try {
    const ref = doc(collection(firestore, "ees-records"));
    const newTx: EESTransaction = { ...tx, id: ref.id };
    await setDoc(ref, newTx);
    return newTx;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create EES transaction");
  }
}

// ─── Financial Records (subcollection path) ─────────────────────────────────

export async function getFinancialRecords(
  houseId: string,
): Promise<FinancialRecord[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(
          doc(collection(firestore, "houses"), houseId),
          "financial-records",
        ),
        orderBy("period", "desc"),
      ),
    );
    return snapshot.docs.map(
      (record) => ({ ...record.data(), id: record.id }) as FinancialRecord,
    );
  } catch (error) {
    logException(error);
    throw new Error("Failed to load financial records");
  }
}

export async function createFinancialRecord(
  record: Omit<FinancialRecord, "id">,
): Promise<FinancialRecord> {
  try {
    const ref = doc(
      collection(
        doc(collection(firestore, "houses"), record.houseId),
        "financial-records",
      ),
    );
    const newRecord: FinancialRecord = { ...record, id: ref.id };
    await setDoc(ref, newRecord);
    return newRecord;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create financial record");
  }
}
