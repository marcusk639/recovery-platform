import { reportGuest, reportRules, reportStats } from '../src/app/residents/compliance-text';

test('resident text reaches the report as text, not markup', () => {
  const guest = { id: 'guest-a', firstName: '<img src=x onerror=alert(1)>', lastName: 'O\'Brien & Sons', phase: '<b>1</b>', rentOwed: 5 };
  expect(reportGuest(guest)).toEqual({
    id: 'guest-a',
    firstName: '&lt;img src=x onerror=alert(1)&gt;',
    lastName: 'O&#39;Brien &amp; Sons',
    phase: '&lt;b&gt;1&lt;/b&gt;',
    rentOwed: 5,
  });
});

test('an ordinary name is unchanged', () => {
  const guest = { id: 'g', firstName: 'Test', lastName: 'GuestA', phase: 'Default' };
  expect(reportGuest(guest)).toEqual(guest);
});

test('a missing name or phase stays missing', () => {
  expect(reportGuest({ id: 'g' })).toEqual({ id: 'g' });
});

// Not a number stays not a number, so the phone's comparisons still say FAIL.
test('report numbers reach the report as numbers', () => {
  const stats = { meetingsAttended: '<b>3</b>' as any, choresCompleted: 1, hoursWorked: '5' as any, primarySupporterMet: 0, medicationTaken: 0 };
  expect(reportStats(stats)).toEqual({ meetingsAttended: NaN, choresCompleted: 1, hoursWorked: 5, primarySupporterMet: 0, medicationTaken: 0 });
});

test('phase rule numbers reach the report as numbers, and flags are kept', () => {
  const rules = { meetings: '<b>3</b>' as any, work: 10, chore: true, supporter: false, medications: true, nightsOutAllowed: 2 };
  expect(reportRules(rules)).toEqual({ meetings: NaN, work: 10, chore: true, supporter: false, medications: true, nightsOutAllowed: 2 });
});

test('a missing phase rule number stays missing, as the phone reads it', () => {
  expect(reportRules({ chore: true } as any)).toEqual({ chore: true });
});
