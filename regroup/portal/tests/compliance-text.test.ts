import { reportGuest, reportRules, reportStats } from '../src/app/residents/compliance-text';

// The phone's report builder (regroup/mobile/src/services/weeklyReportHtml.ts)
// escapes the resident's text itself; its tests are
// regroup/mobile/src/services/__tests__/reportExport.pdfEscaping.test.ts. So the
// portal hands it the text as it is: escaping here as well would print "&amp;"
// for "&" in the exported report.
test('resident text reaches the report as typed, for the phone to escape once', () => {
  const guest = { id: 'guest-a', firstName: '<img src=x onerror=alert(1)>', lastName: 'O\'Brien & Sons', phase: '<b>1</b>', rentOwed: 5 };
  expect(reportGuest(guest)).toEqual(guest);
});

test('an ordinary name is unchanged', () => {
  const guest = { id: 'g', firstName: 'Test', lastName: 'GuestA', phase: 'Default' };
  expect(reportGuest(guest)).toEqual(guest);
});

test('a missing name or phase stays missing, and the guest is a copy', () => {
  const guest = { id: 'g' };
  const copy = reportGuest(guest);
  expect(copy).toEqual({ id: 'g' });
  expect(copy).not.toBe(guest);
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
