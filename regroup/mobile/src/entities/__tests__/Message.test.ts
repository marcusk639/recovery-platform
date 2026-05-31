import {
  Message,
  isAdminMessage,
  isGuestMessage,
  isDirectMessage,
  isHouseMessage,
  createMessageFromFirestore,
} from '../Message';

describe('Message class', () => {
  describe('default constructor (no args)', () => {
    it('does not throw', () => {
      expect(() => new Message()).not.toThrow();
    });

    it('defaults text to empty string', () => {
      const m = new Message();
      expect(m.text).toBe('');
    });

    it('defaults houseId to empty string', () => {
      const m = new Message();
      expect(m.houseId).toBe('');
    });

    it('defaults senderName to empty string', () => {
      const m = new Message();
      expect(m.senderName).toBe('');
    });

    it('defaults read to false', () => {
      const m = new Message();
      expect(m.read).toBe(false);
    });

    it('defaults _id to empty string (synchronized with id)', () => {
      const m = new Message();
      // BaseEntity id defaults to '' so _id is also ''
      expect(m._id).toBe('');
    });

    it('defaults user._id to empty string', () => {
      const m = new Message();
      expect(m.user._id).toBe('');
    });

    it('defaults user.name to empty string', () => {
      const m = new Message();
      expect(m.user.name).toBe('');
    });

    it('defaults user.avatar to empty string', () => {
      const m = new Message();
      expect(m.user.avatar).toBe('');
    });

    it('has a numeric sortKey (Date.now())', () => {
      const before = Date.now();
      const m = new Message();
      const after = Date.now();
      expect(m.sortKey).toBeGreaterThanOrEqual(before);
      expect(m.sortKey).toBeLessThanOrEqual(after);
    });

    it('has an id field from BaseEntity', () => {
      const m = new Message();
      expect(m).toHaveProperty('id');
    });

    it('has createdAt ISO string from BaseEntity', () => {
      const m = new Message();
      expect(typeof m.createdAt).toBe('string');
      expect(() => new Date(m.createdAt)).not.toThrow();
    });
  });

  describe('constructor with explicit arguments', () => {
    it('sets text when provided', () => {
      const m = new Message('Hello there');
      expect(m.text).toBe('Hello there');
    });

    it('sets senderId when provided', () => {
      const m = new Message('Hello', 'sender-99');
      expect(m.senderId).toBe('sender-99');
    });

    it('sets senderName when provided', () => {
      const m = new Message('Hello', 'sender-99', 'Alice');
      expect(m.senderName).toBe('Alice');
    });

    it('syncs user._id to senderId', () => {
      const m = new Message('Hi', 'sender-42', 'Bob');
      expect(m.user._id).toBe('sender-42');
    });

    it('syncs user.name to senderName', () => {
      const m = new Message('Hi', 'sender-42', 'Bob');
      expect(m.user.name).toBe('Bob');
    });

    it('user.avatar remains empty string after construction', () => {
      const m = new Message('Hi', 'sender-42', 'Bob');
      expect(m.user.avatar).toBe('');
    });
  });

  describe('field mutation', () => {
    it('allows houseId to be set after construction', () => {
      const m = new Message();
      m.houseId = 'house-abc';
      expect(m.houseId).toBe('house-abc');
    });

    it('allows read to be toggled to true', () => {
      const m = new Message();
      m.read = true;
      expect(m.read).toBe(true);
    });

    it('allows guestId to be set', () => {
      const m = new Message();
      m.guestId = 'guest-1';
      expect(m.guestId).toBe('guest-1');
    });

    it('allows adminId to be set', () => {
      const m = new Message();
      m.adminId = 'admin-1';
      expect(m.adminId).toBe('admin-1');
    });

    it('allows recipientId to be set', () => {
      const m = new Message();
      m.recipientId = 'recipient-1';
      expect(m.recipientId).toBe('recipient-1');
    });
  });
});

describe('isAdminMessage', () => {
  it('returns true when adminId is set', () => {
    const m = new Message();
    m.adminId = 'admin-1';
    expect(isAdminMessage(m)).toBe(true);
  });

  it('returns false when adminId is not set', () => {
    const m = new Message();
    expect(isAdminMessage(m)).toBe(false);
  });

  it('returns false when adminId is empty string', () => {
    const m = new Message();
    m.adminId = '';
    expect(isAdminMessage(m)).toBe(false);
  });
});

describe('isGuestMessage', () => {
  it('returns true when guestId is set', () => {
    const m = new Message();
    m.guestId = 'guest-1';
    expect(isGuestMessage(m)).toBe(true);
  });

  it('returns false when guestId is not set', () => {
    const m = new Message();
    expect(isGuestMessage(m)).toBe(false);
  });
});

describe('isDirectMessage', () => {
  it('returns true when recipientId is set', () => {
    const m = new Message();
    m.recipientId = 'user-1';
    expect(isDirectMessage(m)).toBe(true);
  });

  it('returns false when recipientId is not set', () => {
    const m = new Message();
    expect(isDirectMessage(m)).toBe(false);
  });
});

describe('isHouseMessage', () => {
  it('returns true when houseId is set and recipientId is absent', () => {
    const m = new Message();
    m.houseId = 'house-1';
    expect(isHouseMessage(m)).toBe(true);
  });

  it('returns false when recipientId is also set', () => {
    const m = new Message();
    m.houseId = 'house-1';
    m.recipientId = 'user-1';
    expect(isHouseMessage(m)).toBe(false);
  });

  it('returns false when houseId is empty and no recipientId', () => {
    const m = new Message();
    expect(isHouseMessage(m)).toBe(false);
  });
});

describe('createMessageFromFirestore', () => {
  const docId = 'doc-123';

  it('does not throw for minimal data', () => {
    expect(() => createMessageFromFirestore(docId, {})).not.toThrow();
  });

  it('assigns the docId to id and _id', () => {
    const m = createMessageFromFirestore(docId, {});
    expect(m.id).toBe(docId);
    expect(m._id).toBe(docId);
  });

  it('assigns text from data', () => {
    const m = createMessageFromFirestore(docId, { text: 'Hello!' });
    expect(m.text).toBe('Hello!');
  });

  it('assigns houseId from data', () => {
    const m = createMessageFromFirestore(docId, { houseId: 'house-xyz' });
    expect(m.houseId).toBe('house-xyz');
  });

  it('defaults houseId to empty string when missing', () => {
    const m = createMessageFromFirestore(docId, {});
    expect(m.houseId).toBe('');
  });

  it('assigns guestId from data', () => {
    const m = createMessageFromFirestore(docId, { guestId: 'guest-5' });
    expect(m.guestId).toBe('guest-5');
  });

  it('assigns adminId from data', () => {
    const m = createMessageFromFirestore(docId, { adminId: 'admin-5' });
    expect(m.adminId).toBe('admin-5');
  });

  it('assigns recipientId from data', () => {
    const m = createMessageFromFirestore(docId, { recipientId: 'rec-7' });
    expect(m.recipientId).toBe('rec-7');
  });

  it('defaults read to false when missing', () => {
    const m = createMessageFromFirestore(docId, {});
    expect(m.read).toBe(false);
  });

  it('preserves read=true from data', () => {
    const m = createMessageFromFirestore(docId, { read: true });
    expect(m.read).toBe(true);
  });

  it('assigns numeric sortKey from data', () => {
    const m = createMessageFromFirestore(docId, { sortKey: 9999999 });
    expect(m.sortKey).toBe(9999999);
  });

  it('parses string sortKey to number', () => {
    const m = createMessageFromFirestore(docId, { sortKey: '1234567' });
    expect(m.sortKey).toBe(1234567);
  });

  it('sets user._id from senderId', () => {
    const m = createMessageFromFirestore(docId, { senderId: 's-1', senderName: 'Alice' });
    expect(m.user._id).toBe('s-1');
  });

  it('sets user.name from senderName', () => {
    const m = createMessageFromFirestore(docId, { senderId: 's-1', senderName: 'Alice' });
    expect(m.user.name).toBe('Alice');
  });

  it('falls back to user._id from data.user object', () => {
    const m = createMessageFromFirestore(docId, { user: { _id: 'u-fallback', name: 'Bob' } });
    expect(m.user._id).toBe('u-fallback');
  });

  it('assigns image from data', () => {
    const m = createMessageFromFirestore(docId, { image: 'https://example.com/img.png' });
    expect(m.image).toBe('https://example.com/img.png');
  });
});
