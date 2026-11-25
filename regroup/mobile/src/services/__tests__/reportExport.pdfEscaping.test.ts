/**
 * The weekly compliance PDF is built from an HTML string. Residents can change
 * their own name, and staff export this report and share it outside the app
 * (court and probation use), so nothing a resident or staff member typed may
 * become markup: a name holding <style> could restyle FAIL rows as PASS. The
 * week's figures are numbers; anything else must print as not-a-number and
 * fail its rule, never pass it.
 */
import { Platform } from 'react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import { exportWeeklyReportPDF } from '../reportExport';

const originalOS = Platform.OS;

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  (generatePDF as jest.Mock).mockReset();
  (generatePDF as jest.Mock).mockResolvedValue({ filePath: '/data/Documents/report.pdf' });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

const stats = {
  meetingsAttended: 3,
  choresCompleted: 1,
  hoursWorked: 20,
  medicationTaken: 0,
  primarySupporterMet: 0,
} as any;
const rules = { meetings: 3, chore: true, work: 20 } as any;

async function htmlFor(guest: any, weekStats: any = stats, phaseRules: any = rules) {
  await exportWeeklyReportPDF(guest, weekStats, '2026-10-05', phaseRules);
  return (generatePDF as jest.Mock).mock.calls[0][0].html as string;
}

/** The report body, between <body> and </body>. */
const bodyOf = (html: string) => html.slice(html.indexOf('<body>'), html.indexOf('</body>'));

describe('exportWeeklyReportPDF HTML', () => {
  it("prints markup in a resident's name as text", async () => {
    const html = await htmlFor({
      id: 'g1',
      firstName: "<style>.fail{font-size:0}.fail::after{content:'PASS'}</style>",
      lastName: '<img src="https://attacker.example/x">',
      phase: 1,
    });

    const body = bodyOf(html);
    expect(body).not.toContain('<style>');
    expect(body).not.toContain('<img');
    expect(body).toContain('&lt;style&gt;.fail{font-size:0}.fail::after{content:&#39;PASS&#39;}&lt;/style&gt;');
    expect(body).toContain('&lt;img src=&quot;https://attacker.example/x&quot;&gt;');
  });

  it('prints a missing name or phase as nothing, not "undefined"', async () => {
    const html = await htmlFor({ id: 'g1', lastName: 'B' });

    const body = bodyOf(html);
    expect(body).toContain('<strong>Resident:</strong> B</p>');
    expect(body).toContain('<strong>Phase:</strong> </p>');
    expect(body).not.toContain('undefined');
  });

  it('prints markup in the phase as text', async () => {
    const html = await htmlFor({ id: 'g1', firstName: 'A', lastName: 'B', phase: '<b>2</b>' });

    expect(bodyOf(html)).toContain('<strong>Phase:</strong> &lt;b&gt;2&lt;/b&gt;');
  });

  it('prints a figure that is not a number as NaN and fails its rule', async () => {
    const html = await htmlFor(
      { id: 'g1', firstName: 'A', lastName: 'B', phase: 1 },
      { ...stats, meetingsAttended: '9</td><td class="pass">PASS' },
    );

    const meetingsRow = bodyOf(html).split('<tr>').find((row) => row.includes('Meetings'))!;
    expect(meetingsRow).toContain('<td>NaN</td>');
    expect(meetingsRow).toContain('FAIL');
    expect(meetingsRow).not.toContain('PASS');
  });

  it('still marks figures that meet the rules as PASS', async () => {
    const html = await htmlFor({ id: 'g1', firstName: 'A', lastName: 'B', phase: 1 });

    const rows = bodyOf(html).split('<tr>');
    const row = (name: string) => rows.find((r) => r.includes(name))!;
    expect(row('Meetings')).toContain('PASS');
    expect(row('Chores')).toContain('PASS');
    expect(row('Work Hours')).toContain('PASS');
  });

  it('stops the renderer loading anything from outside the report', async () => {
    const html = await htmlFor({ id: 'g1', firstName: 'A', lastName: 'B', phase: 1 });

    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head.trimStart()).toMatch(
      /^<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">/,
    );
  });
});
