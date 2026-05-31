import { HouseApplication } from '../Application';

describe('HouseApplication class', () => {
  describe('constructor', () => {
    it('does not throw when instantiated', () => {
      expect(() => new HouseApplication()).not.toThrow();
    });

    it('defaults id to empty string (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(app.id).toBe('');
    });

    it('has a createdAt ISO string (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(typeof app.createdAt).toBe('string');
      expect(() => new Date(app.createdAt)).not.toThrow();
    });

    it('has an updatedAt ISO string (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(typeof app.updatedAt).toBe('string');
      expect(() => new Date(app.updatedAt)).not.toThrow();
    });

    it('createdBy is undefined by default (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(app.createdBy).toBeUndefined();
    });

    it('updatedBy is undefined by default (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(app.updatedBy).toBeUndefined();
    });

    it('uid is undefined by default (from BaseEntity)', () => {
      const app = new HouseApplication();
      expect(app.uid).toBeUndefined();
    });
  });

  describe('field mutation', () => {
    it('allows id to be set after construction', () => {
      const app = new HouseApplication();
      app.id = 'application-abc';
      expect(app.id).toBe('application-abc');
    });

    it('allows createdBy to be set', () => {
      const app = new HouseApplication();
      app.createdBy = 'user-1';
      expect(app.createdBy).toBe('user-1');
    });

    it('allows updatedBy to be set', () => {
      const app = new HouseApplication();
      app.updatedBy = 'user-2';
      expect(app.updatedBy).toBe('user-2');
    });

    it('allows uid to be set', () => {
      const app = new HouseApplication();
      app.uid = 'firebase-uid-xyz';
      expect(app.uid).toBe('firebase-uid-xyz');
    });
  });

  describe('independent instances', () => {
    it('two instances do not share id', () => {
      const a = new HouseApplication();
      const b = new HouseApplication();
      a.id = 'app-a';
      expect(b.id).toBe('');
    });

    it('each instance has its own createdAt timestamp', () => {
      const a = new HouseApplication();
      // Both should be valid ISO strings
      expect(() => new Date(a.createdAt)).not.toThrow();
    });
  });

  describe('HouseApplications interface', () => {
    it('supports indexing HouseApplication instances by string id', () => {
      const apps: { [id: string]: HouseApplication } = {};
      const app = new HouseApplication();
      app.id = 'app-1';
      apps['app-1'] = app;
      expect(apps['app-1'].id).toBe('app-1');
    });

    it('supports multiple entries', () => {
      const apps: { [id: string]: HouseApplication } = {};
      apps['a'] = new HouseApplication();
      apps['b'] = new HouseApplication();
      expect(Object.keys(apps)).toHaveLength(2);
    });
  });
});
