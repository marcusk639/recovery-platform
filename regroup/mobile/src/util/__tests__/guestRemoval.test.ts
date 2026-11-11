import { removalRefusalMessage } from '../guestRemoval';

describe('removalRefusalMessage', () => {
  it('explains a refusal by the rules: below a manager, a resident who owes money stays', () => {
    const err = Object.assign(new Error('denied'), { code: 'firestore/permission-denied' });
    expect(removalRefusalMessage(err)).toMatch(/only a manager can remove a resident who still owes/i);
  });

  it('has nothing to add for any other failure, which keeps the generic message', () => {
    expect(removalRefusalMessage(new Error('offline'))).toBeNull();
    expect(removalRefusalMessage(undefined)).toBeNull();
  });
});
