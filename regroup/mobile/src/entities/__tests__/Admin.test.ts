jest.mock('../../services/admin', () => ({
  createAdminId: jest.fn(() => 'mock-admin-id'),
}));

import Admin from '../Admin';

describe('Admin entity', () => {
  describe('constructor with no optional args', () => {
    it('does not throw when constructed with only email', () => {
      expect(() => new Admin('test@example.com')).not.toThrow();
    });

    it('assigns the email passed to the constructor', () => {
      const admin = new Admin('test@example.com');
      expect(admin.email).toBe('test@example.com');
    });

    it('assigns the id from createAdminId', () => {
      const admin = new Admin('test@example.com');
      expect(admin.id).toBe('mock-admin-id');
    });
  });

  describe('default field values', () => {
    let admin: Admin;

    beforeEach(() => {
      admin = new Admin('admin@example.com');
    });

    it('defaults firstName to empty string', () => {
      expect(admin.firstName).toBe('');
    });

    it('defaults lastName to empty string', () => {
      expect(admin.lastName).toBe('');
    });

    it('defaults userId to empty string', () => {
      expect(admin.userId).toBe('');
    });

    it('defaults superAdmin to an empty array', () => {
      expect(admin.superAdmin).toEqual([]);
    });

    it('defaults houseIds to an empty array', () => {
      expect(admin.houseIds).toEqual([]);
    });

    it('defaults phoneNumber to empty string', () => {
      expect(admin.phoneNumber).toBe('');
    });

    it('defaults uniqueAdminAttribute to "admin"', () => {
      expect(admin.uniqueAdminAttribute).toBe('admin');
    });

    it('avatar is undefined by default', () => {
      expect(admin.avatar).toBeUndefined();
    });
  });

  describe('optional constructor arguments', () => {
    it('sets firstName when provided', () => {
      const admin = new Admin('a@b.com', 'Jane');
      expect(admin.firstName).toBe('Jane');
    });

    it('sets lastName when provided', () => {
      const admin = new Admin('a@b.com', 'Jane', 'Doe');
      expect(admin.lastName).toBe('Doe');
    });

    it('sets userId when provided', () => {
      const admin = new Admin('a@b.com', 'Jane', 'Doe', 'user-123');
      expect(admin.userId).toBe('user-123');
    });

    it('sets superAdmin array when provided', () => {
      const admin = new Admin('a@b.com', 'Jane', 'Doe', 'user-123', ['house-1', 'house-2']);
      expect(admin.superAdmin).toEqual(['house-1', 'house-2']);
    });
  });

  describe('BaseEntity fields', () => {
    it('has a createdAt ISO string', () => {
      const admin = new Admin('a@b.com');
      expect(typeof admin.createdAt).toBe('string');
      expect(() => new Date(admin.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string', () => {
      const admin = new Admin('a@b.com');
      expect(typeof admin.updatedAt).toBe('string');
      expect(() => new Date(admin.updatedAt)).not.toThrow();
    });
  });

  describe('field mutation', () => {
    it('allows houseIds to be updated after construction', () => {
      const admin = new Admin('a@b.com');
      admin.houseIds = ['house-abc'];
      expect(admin.houseIds).toEqual(['house-abc']);
    });

    it('allows avatar to be set after construction', () => {
      const admin = new Admin('a@b.com');
      admin.avatar = 'https://example.com/avatar.png';
      expect(admin.avatar).toBe('https://example.com/avatar.png');
    });

    it('allows phoneNumber to be set after construction', () => {
      const admin = new Admin('a@b.com');
      admin.phoneNumber = '555-1234';
      expect(admin.phoneNumber).toBe('555-1234');
    });
  });
});
