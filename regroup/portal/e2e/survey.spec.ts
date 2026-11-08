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
  ['GuestOverview'],
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
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith('[portal error]')) consoleErrors.push(m.text());
    });
    await signInAs(page, 'manager');
    await page.evaluate(([r, p]) => (window as any).__portalTest.open(r, p), [route, params] as const);
    await page.waitForTimeout(2500);
    const main = page.locator('main');
    const mounted = (await main.count()) > 0 && (await main.innerText()).trim().length > 0;
    rows.push({
      screen: route,
      mounted,
      pageErrors,
      consoleErrors: [...new Set(consoleErrors)],
      deferredShown: await page.getByText(/not available on the web yet/).allInnerTexts(),
      alerts: await page.getByRole('alertdialog').allInnerTexts(),
    });
    await page.screenshot({ path: `dist/survey/${route}.png` });
    expect(route).toBeTruthy();
  });
}
