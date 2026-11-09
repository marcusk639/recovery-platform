// Mounts every first-release screen and records what happens, without failing on
// a broken screen, so the go/no-go report can see the whole set. Not a pass/fail gate.
import fs from 'node:fs';
import { expect, reseed, signInAs, test } from './helpers';

const HOUSE = 'test-house-123';
const GUEST = 'guest-a';
const SCREENS: [string, object?][] = [
  ['HouseList'],
  ['HouseSummary'],
  ['GuestList'],
  ['GuestOverview', { houseId: HOUSE, guestId: GUEST }],
  ['GuestInfo'],
  ['EditUserInfo'],
  ['Beds'],
  ['ApplicationList', { houseId: HOUSE }],
  ['ResidentIntake', { houseId: HOUSE }],
  ['StaffNotes', { houseId: HOUSE, type: 'shift_log' }],
  ['BalanceDashboard', { houseId: HOUSE }],
  ['PaymentHistory'],
  ['PaymentDashboard'],
  ['HouseDisputes'],
  ['Activities'],
  ['MeetingSummary'],
  ['WorkSummary'],
  ['ChoreSummary'],
  ['SupporterSummary'],
  ['MedicationSummary'],
  ['DrugTesting', { houseId: HOUSE }],
  ['DrugTestForm', { houseId: HOUSE, guestId: GUEST }],
  ['DrugTestHistory', { houseId: HOUSE, guestId: GUEST }],
  ['Issues'],
  ['Complaints'],
  ['Documents', { houseId: HOUSE, guestId: GUEST, title: 'Documents' }],
  ['AdminReport', { houseId: HOUSE }],
];

const OUT = 'dist/screen-survey.json';
const rows: object[] = [];

test.use({ allowPageErrors: true });
test.beforeAll(() => {
  reseed();
  fs.mkdirSync('dist/survey', { recursive: true });
});
test.afterAll(() => fs.writeFileSync(OUT, JSON.stringify(rows, null, 2)));

for (const [route, params] of SCREENS) {
  test(`survey ${route}`, async ({ page, pageErrors }) => {
    await signInAs(page, 'manager');
    // After sign-in, so a read the gate makes at sign-in isn't blamed on every screen.
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith('[portal error]')) consoleErrors.push(m.text());
    });
    await page.evaluate(([r, p]) => (window as any).__portalTest.open(r, p), [route, params] as const);
    // Long enough for query retries, so a refused read shows up as one.
    await page.waitForTimeout(6000);
    const main = page.locator('main');
    const hasContent = (await main.count()) > 0 && (await main.innerText()).trim().length > 0;
    const crashed = !hasContent || (await page.getByText('Something went wrong').count()) > 0;
    const degraded = consoleErrors.length > 0 || (await page.getByText(/not available on the web yet/).count()) > 0;
    rows.push({
      screen: route,
      status: crashed ? 'crashed' : degraded ? 'degraded' : 'ok',
      pageErrors,
      consoleErrors: [...new Set(consoleErrors)],
      deferredShown: await page.getByText(/not available on the web yet/).allInnerTexts(),
      alerts: await page.getByRole('alertdialog').allInnerTexts(),
    });
    await page.screenshot({ path: `dist/survey/${route}.png` });
    expect(route).toBeTruthy();
  });
}
