import { firestore } from '../../../firebase-setup';
import { Vote } from '../../entities/oxford/Vote';
import { logException } from '../../util/logging';

export async function createVote(
  houseId: string,
  vote: Omit<Vote, 'id'>,
): Promise<Vote> {
  try {
    const ref = firestore
      .collection('houses')
      .doc(houseId)
      .collection('votes')
      .doc();

    const newVote: Vote = {
      ...vote,
      id: ref.id,
      houseId,
      results: {},
      individualVotes: {},
      passed: false,
      createdAt: new Date().toISOString(),
    };

    await ref.set(newVote);
    return newVote;
  } catch (error) {
    logException(error);
    throw new Error('Failed to create vote');
  }
}

export async function getVotes(houseId: string): Promise<Vote[]> {
  try {
    const snapshot = await firestore
      .collection('houses')
      .doc(houseId)
      .collection('votes')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Vote));
  } catch (error) {
    logException(error);
    throw new Error('Failed to load votes');
  }
}

export async function castVote(
  houseId: string,
  voteId: string,
  guestId: string,
  choice: 'yes' | 'no' | 'abstain',
): Promise<void> {
  const voteRef = firestore
    .collection('houses')
    .doc(houseId)
    .collection('votes')
    .doc(voteId);

  try {
    await firestore.runTransaction(async transaction => {
      const voteDoc = await transaction.get(voteRef);
      if (!voteDoc.exists) {
        throw new Error(`Vote ${voteId} not found`);
      }

      const voteData = voteDoc.data() as Vote;
      const isAnonymous = voteData.isAnonymous ?? false;
      const previousChoice = isAnonymous
        ? undefined
        : voteData.individualVotes[guestId];

      // Update results: decrement previous choice, increment new choice
      const updatedResults = { ...voteData.results };
      if (previousChoice) {
        updatedResults[previousChoice] =
          (updatedResults[previousChoice] || 1) - 1;
      }
      updatedResults[choice] = (updatedResults[choice] || 0) + 1;

      const updatePayload: Record<string, any> = {
        results: updatedResults,
      };

      if (!isAnonymous) {
        updatePayload[`individualVotes.${guestId}`] = choice;
      }

      transaction.update(voteRef, updatePayload);
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to cast vote');
  }
}

export type VoteResult = 'passed' | 'failed' | 'pending';

export function calculateResult(
  vote: Vote,
  threshold: number = 0.8,
): VoteResult {
  if (!vote.closedAt) {
    return 'pending';
  }

  const totalVotes = Object.values(vote.results).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (totalVotes === 0) {
    return 'pending';
  }

  const yesVotes = vote.results['yes'] || 0;
  const yesRatio = yesVotes / totalVotes;

  return yesRatio >= threshold ? 'passed' : 'failed';
}
