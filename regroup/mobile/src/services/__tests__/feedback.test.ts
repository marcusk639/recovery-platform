// src/services/__tests__/feedback.test.ts
//
// Unit tests for the feedback service (src/services/feedback.ts).
//
// The service exports:
//   getFeedback     — queries feedbackCollection via crud.getByAttribute
//   createFeedback  — generates an id via feedbackCollection.doc().id, then
//                     calls crud.create with that id
//   createBugReport — generates an id via bugReportCollection.doc().id, then
//                     calls crud.create with that id
//
// Note: jest.mock() is hoisted before const declarations, so all mock objects
// must be defined inside the factory function. We expose them via hidden
// properties so tests can inspect and control them.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock('../../../firebase-setup', () => {
  const feedbackDocRef = { id: 'feedback-generated-id' };
  const bugDocRef = { id: 'bug-generated-id' };

  const feedbackCollection = {
    doc: jest.fn(() => feedbackDocRef),
    _docRef: feedbackDocRef,
  };

  const bugCollection = {
    doc: jest.fn(() => bugDocRef),
    _docRef: bugDocRef,
  };

  return {
    firestore: {
      collection: jest.fn((name: string) => {
        if (name === 'feedback') return feedbackCollection;
        return bugCollection; // 'bugs'
      }),
      _feedbackCollection: feedbackCollection,
      _bugCollection: bugCollection,
    },
  };
});

jest.mock('../crud', () => ({
  create: jest.fn(),
  getByAttribute: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import * as crud from '../crud';
import { getFeedback, createFeedback, createBugReport } from '../feedback';
import { Feedback } from '../../entities/Feedback';
import { BugReport } from '../../entities/BugReport';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  const f = new Feedback();
  f.id = 'fb1';
  f.description = 'Great app!';
  f.reviewer = 'user1';
  f.type = 'app';
  f.houseId = '';
  return Object.assign(f, overrides);
}

function makeBugReport(): BugReport {
  return new BugReport('App crashes on login', 'user2');
}

// ─── Accessors for mock internals ─────────────────────────────────────────────

const fs = firestore as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('feedback service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore doc() return values after clearAllMocks resets them.
    fs._feedbackCollection.doc.mockReturnValue(fs._feedbackCollection._docRef);
    fs._bugCollection.doc.mockReturnValue(fs._bugCollection._docRef);
    (firestore.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'feedback') return fs._feedbackCollection;
      return fs._bugCollection;
    });
  });

  // ── getFeedback ───────────────────────────────────────────────────────────

  describe('getFeedback', () => {
    it('calls crud.getByAttribute with the supplied attribute, == operator, and value', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getFeedback('reviewer', 'user1');

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'reviewer',
        '==',
        'user1',
      );
    });

    it('returns a key-value map of feedback objects indexed by id', async () => {
      const fb1 = makeFeedback({ id: 'fb1' });
      const fb2 = makeFeedback({ id: 'fb2', description: 'Could be better' });
      (crud.getByAttribute as jest.Mock).mockResolvedValue([fb1, fb2]);

      const result = await getFeedback('reviewer', 'user1');

      expect(result).toEqual({ fb1: fb1, fb2: fb2 });
    });

    it('returns an empty object when no feedback matches', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getFeedback('houseId', 'h-missing');

      expect(result).toEqual({});
    });

    it('supports numeric values as the query filter', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getFeedback('rating', 5);

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'rating',
        '==',
        5,
      );
    });

    it('supports boolean values as the query filter', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getFeedback('resolved', false);

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'resolved',
        '==',
        false,
      );
    });

    it('supports null as the query filter value', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getFeedback('houseId', null);

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'houseId',
        '==',
        null,
      );
    });

    it('propagates errors from crud.getByAttribute', async () => {
      (crud.getByAttribute as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(getFeedback('reviewer', 'user1')).rejects.toThrow('Query failed');
    });
  });

  // ── createFeedback ────────────────────────────────────────────────────────

  describe('createFeedback', () => {
    it('assigns the generated doc id to feedback.id before calling crud.create', async () => {
      const fb = makeFeedback({ id: '' });
      (crud.create as jest.Mock).mockImplementation((_col: any, obj: any, id: any) =>
        Promise.resolve({ ...obj, id }),
      );

      await createFeedback(fb);

      // The id stored on the object and passed as the third argument should match
      const [, passedObj, passedId] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedId).toBe('feedback-generated-id');
      expect(passedObj.id).toBe('feedback-generated-id');
    });

    it('calls crud.create with the feedback collection, object, and generated id', async () => {
      const fb = makeFeedback();
      (crud.create as jest.Mock).mockResolvedValue(fb);

      await createFeedback(fb);

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(),
        fb,
        'feedback-generated-id',
      );
    });

    it('returns the created feedback object from crud.create', async () => {
      const fb = makeFeedback();
      (crud.create as jest.Mock).mockResolvedValue(fb);

      const result = await createFeedback(fb);

      expect(result).toEqual(fb);
    });

    it('propagates errors from crud.create', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Write failed'));

      await expect(createFeedback(makeFeedback())).rejects.toThrow('Write failed');
    });

    it('works correctly for house-type feedback', async () => {
      const fb = makeFeedback({ type: 'house', houseId: 'h1' });
      (crud.create as jest.Mock).mockResolvedValue(fb);

      const result = await createFeedback(fb);

      expect(result.type).toBe('house');
      expect(result.houseId).toBe('h1');
    });
  });

  // ── createBugReport ───────────────────────────────────────────────────────

  describe('createBugReport', () => {
    it('assigns the generated doc id to bugReport.id before calling crud.create', async () => {
      const bug = makeBugReport();
      (crud.create as jest.Mock).mockImplementation((_col: any, obj: any, id: any) =>
        Promise.resolve({ ...obj, id }),
      );

      await createBugReport(bug);

      const [, passedObj, passedId] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedId).toBe('bug-generated-id');
      expect(passedObj.id).toBe('bug-generated-id');
    });

    it('calls crud.create with the bugs collection, object, and generated id', async () => {
      const bug = makeBugReport();
      (crud.create as jest.Mock).mockResolvedValue(bug);

      await createBugReport(bug);

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(),
        bug,
        'bug-generated-id',
      );
    });

    it('returns the created bug report from crud.create', async () => {
      const bug = makeBugReport();
      (crud.create as jest.Mock).mockResolvedValue(bug);

      const result = await createBugReport(bug);

      expect(result.description).toBe('App crashes on login');
      expect(result.reporter).toBe('user2');
    });

    it('propagates errors from crud.create', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Bug write failed'));

      await expect(createBugReport(makeBugReport())).rejects.toThrow('Bug write failed');
    });

    it('persists a bug report with an empty description', async () => {
      const bug = new BugReport('', 'user3');
      (crud.create as jest.Mock).mockResolvedValue(bug);

      const result = await createBugReport(bug);

      expect(result.description).toBe('');
    });
  });
});
