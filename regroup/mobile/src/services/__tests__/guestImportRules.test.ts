import { FIELD_CAPS, normalizeEmail, rowProblem, toIsoDate } from '../guestImportRules';

const good = (extra: Record<string, string> = {}) => ({
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  sobrietyDate: '2025-01-15',
  drugOfChoice: 'Alcohol',
  ...extra,
});

describe('toIsoDate', () => {
  it('keeps YYYY-MM-DD and pads single digits', () => {
    expect(toIsoDate('2025-01-15')).toBe('2025-01-15');
    expect(toIsoDate('2025-1-5')).toBe('2025-01-05');
  });

  it('reads M/D/YYYY, as a spreadsheet exports it', () => {
    expect(toIsoDate('3/7/2024')).toBe('2024-03-07');
  });

  it('refuses what is not a calendar date', () => {
    for (const bad of ['2025-02-30', '13/01/2024', 'yesterday', '', '2025/01/15', '0024-01-01']) {
      expect(toIsoDate(bad)).toBeNull();
    }
  });
});

describe('rowProblem', () => {
  it('accepts a good row', () => {
    expect(rowProblem(good(), new Set())).toBeNull();
  });

  it('names the missing fields', () => {
    expect(rowProblem(good({ email: '', drugOfChoice: '' }), new Set())).toBe(
      'missing email, drugOfChoice',
    );
  });

  it('refuses a field over its cap', () => {
    expect(rowProblem(good({ firstName: 'x'.repeat(FIELD_CAPS.firstName + 1) }), new Set())).toBe(
      'firstName is longer than 100 characters',
    );
    expect(rowProblem(good({ phoneNumber: '5'.repeat(41) }), new Set())).toBe(
      'phoneNumber is longer than 40 characters',
    );
  });

  it('refuses a bad email, a bad sobriety date and a bad move-in date', () => {
    expect(rowProblem(good({ email: 'not-an-email' }), new Set())).toBe(
      'email is not a valid address',
    );
    expect(rowProblem(good({ sobrietyDate: '2025-13-01' }), new Set())).toBe(
      'sobrietyDate is not a date (use YYYY-MM-DD)',
    );
    expect(rowProblem(good({ moveInDate: 'soon' }), new Set())).toBe(
      'moveInDate is not a date (use YYYY-MM-DD)',
    );
  });

  it('refuses an email already in the file, whatever its case', () => {
    expect(rowProblem(good({ email: 'JANE@Example.com' }), new Set(['jane@example.com']))).toBe(
      'email appears earlier in the file',
    );
  });

  it('normalizes an email for comparison', () => {
    expect(normalizeEmail('  Jane@Example.COM ')).toBe('jane@example.com');
  });
});
