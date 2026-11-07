import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import { firestore, functions } from "../../../firebase-setup";
import { Vote } from "../../entities/oxford/Vote";
import { logException } from "../../util/logging";

const votesOf = (houseId: string) =>
  collection(doc(collection(firestore, "houses"), houseId), "votes");

export async function createVote(
  houseId: string,
  vote: Omit<Vote, "id">
): Promise<Vote> {
  try {
    const ref = doc(votesOf(houseId));

    const newVote: Vote = {
      ...vote,
      id: ref.id,
      houseId,
      results: {},
      individualVotes: {},
      voterIds: [],
      passed: false,
      createdAt: new Date().toISOString(),
    };

    await setDoc(ref, newVote);
    return newVote;
  } catch (error) {
    logException(error);
    throw new Error("Failed to create vote");
  }
}

export async function getVotes(houseId: string): Promise<Vote[]> {
  try {
    const snapshot = await getDocs(query(votesOf(houseId), orderBy("createdAt", "desc")));

    return snapshot.docs.map((vote) => ({ ...vote.data(), id: vote.id } as Vote));
  } catch (error) {
    logException(error);
    throw new Error("Failed to load votes");
  }
}

// Hardened 2026-07-07: castVote used to run a client-side Firestore
// transaction that wrote results/individualVotes/voterIds directly, with only
// "isGuestOrAdmin && houseOxfordActive" enforced by firestore.rules — no
// field-level scoping. Anonymous ballots carry no signed identity in the vote
// document itself, so a modified client (or a raw Firestore write) could set
// those fields to anything: inflate a tally, clear its own guestId out of
// voterIds to re-vote, or edit another guest's individualVotes entry. The
// "already voted" check below was real code, but it was never a security
// boundary. Vote casting now goes through the castOxfordVote Cloud Function
// (Admin SDK), which resolves the caller's guestId from their own auth uid
// rather than trusting a client-supplied guestId, and firestore.rules denies
// direct client writes to votes/{voteId} entirely.
export async function castVote(
  houseId: string,
  voteId: string,
  // Accepted for call-site compatibility (callers already have their own
  // guestId for local UI state), but intentionally NOT sent to the server —
  // the callable resolves the true guestId from the caller's own auth uid.
  _callerBelievedGuestId: string,
  choice: "yes" | "no" | "abstain"
): Promise<void> {
  try {
    await httpsCallable(functions, "castOxfordVote")({
      houseId,
      voteId,
      choice,
    });
  } catch (error: any) {
    logException(error);
    if (error?.message === "You have already voted on this poll.") {
      throw new Error("You have already voted on this poll.");
    }
    throw new Error("Failed to cast vote");
  }
}

export type VoteResult = "passed" | "failed" | "pending";

export function calculateResult(
  vote: Vote,
  threshold: number = 0.8
): VoteResult {
  if (!vote.closedAt) {
    return "pending";
  }

  const totalVotes = Object.values(vote.results).reduce(
    (sum, count) => sum + count,
    0
  );
  if (totalVotes === 0) {
    return "pending";
  }

  const yesVotes = vote.results["yes"] || 0;
  const yesRatio = yesVotes / totalVotes;

  return yesRatio >= threshold ? "passed" : "failed";
}
