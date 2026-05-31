// User.tsx has no external service dependencies requiring mocks beyond what
// jest.setup.js and the firebase-setup moduleNameMapper already provide.

import { User, OperatorSubscription, removeUserFromHouse } from '../User';

describe('OperatorSubscription entity', () => {
  it('does not throw when instantiated', () => {
    expect(() => new OperatorSubscription()).not.toThrow();
  });

  it('defaults subscriptionId to empty string', () => {
    const sub = new OperatorSubscription();
    expect(sub.subscriptionId).toBe('');
  });

  it('defaults currentPeriodEnd to 0', () => {
    const sub = new OperatorSubscription();
    expect(sub.currentPeriodEnd).toBe(0);
  });

  it('defaults customerId to empty string', () => {
    const sub = new OperatorSubscription();
    expect(sub.customerId).toBe('');
  });

  it('defaults status to empty string', () => {
    const sub = new OperatorSubscription();
    expect(sub.status).toBe('');
  });

  it('defaults items with empty houseItemId and guestItemId', () => {
    const sub = new OperatorSubscription();
    expect(sub.items).toEqual({ houseItemId: '', guestItemId: '' });
  });

  it('defaults houses to an empty object', () => {
    const sub = new OperatorSubscription();
    expect(sub.houses).toEqual({});
  });
});

describe('User entity', () => {
  describe('constructor with no args', () => {
    it('does not throw when instantiated without arguments', () => {
      expect(() => new User()).not.toThrow();
    });

    it('uid defaults to empty string when no arg passed', () => {
      const user = new User();
      expect(user.uid).toBe('');
    });

    it('id defaults to empty string when no arg passed', () => {
      const user = new User();
      expect(user.id).toBe('');
    });
  });

  describe('constructor with uid argument', () => {
    it('sets uid to the provided value', () => {
      const user = new User('firebase-uid-123');
      expect(user.uid).toBe('firebase-uid-123');
    });

    it('synchronises id with the provided uid', () => {
      const user = new User('firebase-uid-123');
      expect(user.id).toBe('firebase-uid-123');
    });

    it('uid and id are equal after construction', () => {
      const user = new User('some-uid');
      expect(user.id).toBe(user.uid);
    });
  });

  describe('default field values — role IDs', () => {
    let user: User;

    beforeEach(() => {
      user = new User();
    });

    it('defaults adminId to empty string', () => {
      expect(user.adminId).toBe('');
    });

    it('defaults guestId to empty string', () => {
      expect(user.guestId).toBe('');
    });

    it('defaults houseId to empty string', () => {
      expect(user.houseId).toBe('');
    });
  });

  describe('default field values — role flags', () => {
    let user: User;

    beforeEach(() => {
      user = new User();
    });

    it('defaults isAdmin to false', () => {
      expect(user.isAdmin).toBe(false);
    });

    it('defaults isGuest to false', () => {
      expect(user.isGuest).toBe(false);
    });

    it('defaults isSuperAdmin to false', () => {
      expect(user.isSuperAdmin).toBe(false);
    });

    it('defaults potentialGuest to false', () => {
      expect(user.potentialGuest).toBe(false);
    });

    it('defaults potentialSuperAdmin to false', () => {
      expect(user.potentialSuperAdmin).toBe(false);
    });
  });

  describe('default field values — account status', () => {
    let user: User;

    beforeEach(() => {
      user = new User();
    });

    it('defaults emailVerified to true', () => {
      expect(user.emailVerified).toBe(true);
    });

    it('defaults houseAccountVerified to false', () => {
      expect(user.houseAccountVerified).toBe(false);
    });

    it('defaults infoEntered to false', () => {
      expect(user.infoEntered).toBe(false);
    });

    it('defaults isAnonymous to false', () => {
      expect(user.isAnonymous).toBe(false);
    });

    it('defaults termsOfService to false', () => {
      expect(user.termsOfService).toBe(false);
    });

    it('defaults keepUpdated to false', () => {
      expect(user.keepUpdated).toBe(false);
    });

    it('defaults orgSetupCompleted to false', () => {
      expect(user.orgSetupCompleted).toBe(false);
    });

    it('defaults houseCode to empty string', () => {
      expect(user.houseCode).toBe('');
    });
  });

  describe('default field values — personal information', () => {
    let user: User;

    beforeEach(() => {
      user = new User();
    });

    it('defaults email to empty string', () => {
      expect(user.email).toBe('');
    });

    it('defaults firstName to empty string', () => {
      expect(user.firstName).toBe('');
    });

    it('defaults lastName to empty string', () => {
      expect(user.lastName).toBe('');
    });

    it('defaults middleInitial to empty string', () => {
      expect(user.middleInitial).toBe('');
    });

    it('defaults phoneNumber to empty string', () => {
      expect(user.phoneNumber).toBe('');
    });

    it('defaults avatar to empty string', () => {
      expect(user.avatar).toBe('');
    });

    it('defaults gender to "male"', () => {
      expect(user.gender).toBe('male');
    });

    it('defaults ethnicity to empty string', () => {
      expect(user.ethnicity).toBe('');
    });

    it('defaults dateOfBirth to empty string', () => {
      expect(user.dateOfBirth).toBe('');
    });

    it('defaults sobrietyDate to empty string', () => {
      expect(user.sobrietyDate).toBe('');
    });

    it('defaults ssn to empty string', () => {
      expect(user.ssn).toBe('');
    });

    it('defaults maritalStatus to empty string', () => {
      expect(user.maritalStatus).toBe('');
    });

    it('defaults housingStatus to "renter"', () => {
      expect(user.housingStatus).toBe('renter');
    });
  });

  describe('default field values — management', () => {
    let user: User;

    beforeEach(() => {
      user = new User();
    });

    it('defaults housesOwned to an empty array', () => {
      expect(user.housesOwned).toEqual([]);
    });

    it('defaults messagingToken to an empty array', () => {
      expect(user.messagingToken).toEqual([]);
    });

    it('initialises subscriptionMetadata as an OperatorSubscription', () => {
      expect(user.subscriptionMetadata).toBeInstanceOf(OperatorSubscription);
    });
  });

  describe('BaseEntity fields', () => {
    it('has a createdAt ISO string', () => {
      const user = new User();
      expect(typeof user.createdAt).toBe('string');
      expect(isNaN(new Date(user.createdAt).getTime())).toBe(false);
    });

    it('has an updatedAt ISO string', () => {
      const user = new User();
      expect(typeof user.updatedAt).toBe('string');
      expect(isNaN(new Date(user.updatedAt).getTime())).toBe(false);
    });
  });

  describe('field mutation', () => {
    it('allows firstName and lastName to be set', () => {
      const user = new User();
      user.firstName = 'Alice';
      user.lastName = 'Smith';
      expect(user.firstName).toBe('Alice');
      expect(user.lastName).toBe('Smith');
    });

    it('allows isAdmin to be toggled', () => {
      const user = new User();
      user.isAdmin = true;
      expect(user.isAdmin).toBe(true);
    });

    it('allows housesOwned to be populated', () => {
      const user = new User();
      user.housesOwned = ['house-1', 'house-2'];
      expect(user.housesOwned).toHaveLength(2);
    });
  });
});

describe('removeUserFromHouse utility', () => {
  it('returns a reset object with expected shape', () => {
    const result = removeUserFromHouse();
    expect(result).toEqual({
      guestId: null,
      houseId: null,
      potentialGuest: false,
      potentialSuperAdmin: false,
      isGuest: false,
      isSuperAdmin: false,
    });
  });

  it('returns null for guestId', () => {
    expect(removeUserFromHouse().guestId).toBeNull();
  });

  it('returns null for houseId', () => {
    expect(removeUserFromHouse().houseId).toBeNull();
  });

  it('returns false for all boolean flags', () => {
    const result = removeUserFromHouse();
    expect(result.potentialGuest).toBe(false);
    expect(result.potentialSuperAdmin).toBe(false);
    expect(result.isGuest).toBe(false);
    expect(result.isSuperAdmin).toBe(false);
  });
});
