/**
 * oxford/votes.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. Ballots go through the castOxfordVote callable (no client
 * transaction since 2026-07-07), so the pinned contract is its payload.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import { failNext, getOpLog, resetOpLog, seedQuery } from '../../../__mocks__/firebase-modular/log';
import { castVote, createVote, getVotes } from '../oxford/votes';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

describe('createVote', () => {
  it('writes an empty tally at houses/{houseId}/votes/{generated id}', async () => {
    const vote = await createVote('h1', { title: 'Paint', isAnonymous: true } as any);

    const written = {
      title: 'Paint',
      isAnonymous: true,
      id: 'auto-1',
      houseId: 'h1',
      results: {},
      individualVotes: {},
      voterIds: [],
      passed: false,
      createdAt: ISO,
    };
    expect(vote).toEqual(written);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'houses/h1/votes/auto-1', data: written }]);
  });
});

describe('getVotes', () => {
  it("lists the house's votes newest first", async () => {
    seedQuery('houses/h1/votes', [
      { id: 'v1', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'v2', createdAt: '2026-10-02T00:00:00.000Z' },
    ]);

    expect((await getVotes('h1')).map((v) => v.id)).toEqual(['v2', 'v1']);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'houses/h1/votes', constraints: [['orderBy', 'createdAt', 'desc']] },
    ]);
  });
});

describe('castVote', () => {
  it('sends house, vote and choice, never the caller-supplied guest id', async () => {
    await castVote('h1', 'v1', 'g-claimed', 'yes');

    expect(getOpLog()).toEqual([
      { op: 'call', path: 'castOxfordVote', data: { houseId: 'h1', voteId: 'v1', choice: 'yes' } },
    ]);
  });

  it('passes the already-voted refusal through', async () => {
    failNext('call', new Error('You have already voted on this poll.'), 'castOxfordVote');

    await expect(castVote('h1', 'v1', 'g', 'no')).rejects.toThrow(
      'You have already voted on this poll.',
    );
  });

  it('maps any other failure to a generic message', async () => {
    failNext('call', new Error('internal'), 'castOxfordVote');

    await expect(castVote('h1', 'v1', 'g', 'abstain')).rejects.toThrow('Failed to cast vote');
  });
});
