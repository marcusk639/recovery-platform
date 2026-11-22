import { buildWeeklyReportHtml } from '@mobile/services/weeklyReportHtml';
import { reportGuest, reportRules, reportStats } from '../src/app/residents/compliance-text';

// The phone's report builder escapes the resident's text itself, so the portal
// hands it plain text: escaping here as well would print "&amp;" for "&".
// ComplianceExport passes reportGuest(guest), so these go through it too.
const reportFor = (guest: Record<string, unknown>) =>
  buildWeeklyReportHtml(reportGuest(guest) as any, {} as any, '2026-10-05', {} as any);

test('resident text reaches the report as text, not markup, escaped once', () => {
  const html = reportFor({ id: 'guest-a', firstName: '<img src=x onerror=alert(1)>', lastName: 'O\'Brien & Sons', phase: '<b>1</b>' });
  expect(html).toContain('<strong>Resident:</strong> &lt;img src=x onerror=alert(1)&gt; O&#39;Brien &amp; Sons</p>');
  expect(html).toContain('<strong>Phase:</strong> &lt;b&gt;1&lt;/b&gt;</p>');
  expect(html).not.toContain('&amp;#39;');
  expect(html).not.toContain('<img');
});

test('an ordinary name is unchanged', () => {
  const html = reportFor({ id: 'g', firstName: 'Test', lastName: 'GuestA', phase: 'Default' });
  expect(html).toContain('<strong>Resident:</strong> Test GuestA</p>');
  expect(html).toContain('<strong>Phase:</strong> Default</p>');
});

test('a missing name or phase prints nothing', () => {
  const html = reportFor({ id: 'g' });
  expect(html).toContain('<strong>Resident:</strong> </p>');
  expect(html).not.toContain('undefined');
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
