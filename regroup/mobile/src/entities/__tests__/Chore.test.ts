// Chore.tsx has no external dependencies beyond yup, which is a pure JS library.

import { Chore, choreSchema, defaultChores } from '../Chore';

describe('Chore entity', () => {
  describe('constructor', () => {
    it('does not throw when instantiated', () => {
      expect(() => new Chore()).not.toThrow();
    });

    it('defaults name to "None"', () => {
      const chore = new Chore();
      expect(chore.name).toBe('None');
    });

    it('defaults description to "None"', () => {
      const chore = new Chore();
      expect(chore.description).toBe('None');
    });

    it('name is never empty after construction', () => {
      const chore = new Chore();
      expect(chore.name.trim()).not.toBe('');
    });
  });

  describe('field mutation', () => {
    it('allows name to be set after construction', () => {
      const chore = new Chore();
      chore.name = 'Dishes';
      expect(chore.name).toBe('Dishes');
    });

    it('allows description to be set after construction', () => {
      const chore = new Chore();
      chore.description = 'Wash all dishes in the sink.';
      expect(chore.description).toBe('Wash all dishes in the sink.');
    });
  });
});

describe('choreSchema', () => {
  it('validates a chore with name and description', async () => {
    await expect(
      choreSchema.validate({ name: 'Dishes', description: 'Wash the dishes.' }),
    ).resolves.toBeDefined();
  });

  it('rejects a chore with missing name', async () => {
    await expect(
      choreSchema.validate({ description: 'No name here.' }),
    ).rejects.toThrow();
  });

  it('rejects a chore with missing description', async () => {
    await expect(
      choreSchema.validate({ name: 'Dishes' }),
    ).rejects.toThrow();
  });
});

describe('defaultChores', () => {
  it('contains a Bathroom entry', () => {
    expect(defaultChores).toHaveProperty('Bathroom');
  });

  it('contains a Living Room entry', () => {
    expect(defaultChores).toHaveProperty('Living Room');
  });

  it('contains a Kitchen entry', () => {
    expect(defaultChores).toHaveProperty('Kitchen');
  });

  it('contains exactly three default chores', () => {
    expect(Object.keys(defaultChores)).toHaveLength(3);
  });

  it('Bathroom chore has correct name and description', () => {
    expect(defaultChores['Bathroom'].name).toBe('Bathroom');
    expect(defaultChores['Bathroom'].description).toBe('Clean the bathroom.');
  });

  it('Living Room chore has correct name and description', () => {
    expect(defaultChores['Living Room'].name).toBe('Living Room');
    expect(defaultChores['Living Room'].description).toBe('Clean the living room.');
  });

  it('Kitchen chore has correct name and description', () => {
    expect(defaultChores['Kitchen'].name).toBe('Kitchen');
    expect(defaultChores['Kitchen'].description).toBe('Clean the kitchen.');
  });

  it('each entry has a non-empty name', () => {
    Object.values(defaultChores).forEach(chore => {
      expect(chore.name.trim()).not.toBe('');
    });
  });

  it('each entry has a non-empty description', () => {
    Object.values(defaultChores).forEach(chore => {
      expect(chore.description.trim()).not.toBe('');
    });
  });
});
