import { removalRefusalMessage } from '../guestRemoval';

describe('removalRefusalMessage', () => {
  it('explains a refusal by the rules: below a manager, a resident who owes money stays', () => {
    const err = Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
    const message = removalRefusalMessage(err) ?? '';
    // Neutral about why: the rules also refuse removing someone who outranks the caller.
    expect(message).toMatch(/don.t have permission to remove this resident/i);
    expect(message).toMatch(/only a manager can remove a resident who still owes/i);
  });

  it('has nothing to add for any other failure, which keeps the generic message', () => {
    expect(removalRefusalMessage(new Error('offline'))).toBeNull();
    expect(removalRefusalMessage(undefined)).toBeNull();
  });
});
