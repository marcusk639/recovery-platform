import { DirectMessage, Conversations } from '../DirectConversation';
import { Message } from '../Message';

describe('DirectMessage class', () => {
  describe('constructor', () => {
    it('does not throw when instantiated with no arguments', () => {
      expect(() => new DirectMessage()).not.toThrow();
    });

    it('is an instance of Message (extends Message)', () => {
      const dm = new DirectMessage();
      expect(dm).toBeInstanceOf(Message);
    });

    it('inherits text default of empty string from Message', () => {
      const dm = new DirectMessage();
      expect(dm.text).toBe('');
    });

    it('inherits houseId default of empty string from Message', () => {
      const dm = new DirectMessage();
      expect(dm.houseId).toBe('');
    });

    it('inherits senderName default of empty string from Message', () => {
      const dm = new DirectMessage();
      expect(dm.senderName).toBe('');
    });

    it('inherits read default of false from Message', () => {
      const dm = new DirectMessage();
      expect(dm.read).toBe(false);
    });

    it('inherits a numeric sortKey from Message', () => {
      const before = Date.now();
      const dm = new DirectMessage();
      const after = Date.now();
      expect(dm.sortKey).toBeGreaterThanOrEqual(before);
      expect(dm.sortKey).toBeLessThanOrEqual(after);
    });

    it('inherits id field from BaseEntity via Message', () => {
      const dm = new DirectMessage();
      expect(dm).toHaveProperty('id');
    });

    it('inherits createdAt ISO string from BaseEntity via Message', () => {
      const dm = new DirectMessage();
      expect(typeof dm.createdAt).toBe('string');
      expect(() => new Date(dm.createdAt)).not.toThrow();
    });

    it('inherits user object from Message', () => {
      const dm = new DirectMessage();
      expect(dm.user).toBeDefined();
      expect(dm.user._id).toBe('');
      expect(dm.user.name).toBe('');
    });
  });

  describe('constructor with Message arguments', () => {
    it('accepts text as first argument', () => {
      const dm = new DirectMessage('Hey!');
      expect(dm.text).toBe('Hey!');
    });

    it('accepts senderId as second argument', () => {
      const dm = new DirectMessage('Hey!', 'sender-1');
      expect(dm.senderId).toBe('sender-1');
    });

    it('accepts senderName as third argument', () => {
      const dm = new DirectMessage('Hey!', 'sender-1', 'Alice');
      expect(dm.senderName).toBe('Alice');
    });
  });

  describe('field mutation', () => {
    it('allows houseId to be set', () => {
      const dm = new DirectMessage();
      dm.houseId = 'house-99';
      expect(dm.houseId).toBe('house-99');
    });

    it('allows recipientId to be set', () => {
      const dm = new DirectMessage();
      dm.recipientId = 'recipient-1';
      expect(dm.recipientId).toBe('recipient-1');
    });

    it('allows guestId to be set', () => {
      const dm = new DirectMessage();
      dm.guestId = 'guest-1';
      expect(dm.guestId).toBe('guest-1');
    });

    it('allows adminId to be set', () => {
      const dm = new DirectMessage();
      dm.adminId = 'admin-1';
      expect(dm.adminId).toBe('admin-1');
    });

    it('allows read to be set to true', () => {
      const dm = new DirectMessage();
      dm.read = true;
      expect(dm.read).toBe(true);
    });
  });
});

describe('Conversations class', () => {
  it('can be instantiated without throwing', () => {
    expect(() => new Conversations()).not.toThrow();
  });

  it('can hold an array of DirectMessages under a string key', () => {
    const convos = new Conversations();
    const dm = new DirectMessage('Hello', 'sender-1', 'Alice');
    (convos as Record<string, DirectMessage[]>)['convo-key'] = [dm];
    expect((convos as Record<string, DirectMessage[]>)['convo-key']).toHaveLength(1);
    expect((convos as Record<string, DirectMessage[]>)['convo-key'][0].text).toBe('Hello');
  });

  it('starts as an empty object with no own keys', () => {
    const convos = new Conversations();
    expect(Object.keys(convos)).toHaveLength(0);
  });

  it('supports multiple conversation keys', () => {
    const convos = new Conversations() as Record<string, DirectMessage[]>;
    convos['conv-1'] = [new DirectMessage('Hi')];
    convos['conv-2'] = [new DirectMessage('Hey'), new DirectMessage('There')];
    expect(Object.keys(convos)).toHaveLength(2);
    expect(convos['conv-2']).toHaveLength(2);
  });
});
