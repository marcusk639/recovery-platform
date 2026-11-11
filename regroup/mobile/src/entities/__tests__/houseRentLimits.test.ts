import { houseSchema } from '../House';

// The form must refuse what the Firestore rules refuse, or the whole house save fails
// with a permission error instead of a field message.
describe('houseSchema rent limits', () => {
  const field = (name: 'weeklyRent' | 'monthlyRent', value: number) =>
    houseSchema.validateAt(name, { [name]: value });

  it('accepts a weekly rent at the rules limit of $2,500', () =>
    expect(field('weeklyRent', 2500)).resolves.toBe(2500));
  it('refuses a weekly rent above $2,500', () =>
    expect(field('weeklyRent', 2501)).rejects.toThrow());
});
