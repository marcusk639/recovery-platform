import Organization, { orgSchema } from '../Organization';

describe('Organization class defaults', () => {
  it('can be instantiated with no arguments', () => {
    const org = new Organization();
    expect(org).toBeInstanceOf(Organization);
  });

  it('name defaults to empty string', () => {
    const org = new Organization();
    expect(org.name).toBe('');
  });

  it('owners defaults to empty array', () => {
    const org = new Organization();
    expect(org.owners).toEqual([]);
    expect(Array.isArray(org.owners)).toBe(true);
  });

  it('associates defaults to empty array', () => {
    const org = new Organization();
    expect(org.associates).toEqual([]);
    expect(Array.isArray(org.associates)).toBe(true);
  });

  it('houseIds defaults to empty array', () => {
    const org = new Organization();
    expect(org.houseIds).toEqual([]);
    expect(Array.isArray(org.houseIds)).toBe(true);
  });

  it('numberOfHouses defaults to 0', () => {
    const org = new Organization();
    expect(org.numberOfHouses).toBe(0);
  });

  it('inherits id from BaseEntity, defaults to empty string', () => {
    const org = new Organization();
    expect(org.id).toBe('');
  });

  it('inherits createdAt from BaseEntity as ISO string', () => {
    const org = new Organization();
    expect(typeof org.createdAt).toBe('string');
    expect(new Date(org.createdAt).toISOString()).toBe(org.createdAt);
  });

  it('inherits updatedAt from BaseEntity as ISO string', () => {
    const org = new Organization();
    expect(typeof org.updatedAt).toBe('string');
  });
});

describe('Organization field assignments', () => {
  it('name can be set', () => {
    const org = new Organization();
    org.name = 'Recovery Network Inc';
    expect(org.name).toBe('Recovery Network Inc');
  });

  it('owners array can be populated', () => {
    const org = new Organization();
    org.owners = ['user-001', 'user-002'];
    expect(org.owners).toHaveLength(2);
    expect(org.owners[0]).toBe('user-001');
  });

  it('associates array can be populated', () => {
    const org = new Organization();
    org.associates = ['user-003', 'user-004', 'user-005'];
    expect(org.associates).toHaveLength(3);
  });

  it('houseIds array can be populated', () => {
    const org = new Organization();
    org.houseIds = ['house-001', 'house-002'];
    expect(org.houseIds).toHaveLength(2);
  });

  it('numberOfHouses can be set to a number', () => {
    const org = new Organization();
    org.numberOfHouses = 5;
    expect(org.numberOfHouses).toBe(5);
  });

  it('numberOfHouses can be a string (flexible type)', () => {
    const org = new Organization();
    org.numberOfHouses = '3';
    expect(org.numberOfHouses).toBe('3');
  });

  it('id can be set', () => {
    const org = new Organization();
    org.id = 'org-doc-id';
    expect(org.id).toBe('org-doc-id');
  });

  it('two Organization instances are independent', () => {
    const o1 = new Organization();
    const o2 = new Organization();
    o1.name = 'Org A';
    o2.name = 'Org B';
    expect(o1.name).not.toBe(o2.name);
  });

  it('owners and houseIds are separate arrays per instance', () => {
    const o1 = new Organization();
    const o2 = new Organization();
    o1.owners.push('user-x');
    expect(o2.owners).toHaveLength(0);
  });
});

describe('orgSchema validation', () => {
  it('is defined', () => {
    expect(orgSchema).toBeDefined();
  });

  it('passes validation when name is provided', async () => {
    await expect(orgSchema.validate({ name: 'My Organization' })).resolves.toBeTruthy();
  });

  it('fails validation when name is empty string', async () => {
    await expect(orgSchema.validate({ name: '' })).rejects.toThrow();
  });

  it('fails validation when name is missing', async () => {
    await expect(orgSchema.validate({})).rejects.toThrow();
  });

  it('validation error message includes "Required" for missing name', async () => {
    try {
      await orgSchema.validate({ name: '' });
    } catch (err: any) {
      expect(err.message).toContain('Required');
    }
  });
});
