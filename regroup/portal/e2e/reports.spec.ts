// Reports and the resident compliance export. The export prints the phone's own
// report HTML (services/reportExport.ts) in a sandboxed print view.
import type { Page } from '@playwright/test';
import { format, parseISO } from 'date-fns';
import { makePeerLeader, setWeekStats, weekStart } from './fixtures';
import { admin, expect, reseed, signInAs, test } from './helpers';
import { HOUSE } from './later-fixtures';

const RECORD = `/houses/${HOUSE}/residents/guest-a`;
const exportButton = (page: Page) => page.getByTestId('export-compliance-report');
const printView = (page: Page) => page.frameLocator('[data-testid="print-view"]');

test.beforeEach(() => reseed());

async function activeCount(): Promise<number> {
  const snap = await admin()
    .collection('guests')
    .where('houseId', '==', HOUSE)
    .where('status', '==', 'active')
    .get();
  return snap.size;
}

async function openRecord(page: Page) {
  await signInAs(page, 'manager');
  await page.goto(RECORD);
  await expect(page.getByTestId('record-header')).toBeVisible({ timeout: 20_000 });
}

test("the admin report shows the house's numbers", async ({ page }) => {
  const active = await activeCount();
  await signInAs(page, 'manager');
  await page.locator('#nav-reports').click();
  // RatsText doesn't pass its testID through, so these match the phone's copy.
  const occupancy = page.getByTestId('occupancy-section');
  await expect(occupancy).toContainText(`${active} / 10`, { timeout: 20_000 });
  await expect(occupancy).toContainText(`(${Math.round((active / 10) * 100)}%)`);
  await expect(page.getByTestId('discharge-section')).toContainText('No discharges in the last 30 days.');
});

// Passes today, so a broken compliance section can't hide behind the expected failure below.
test('the 4-week compliance section shows four weeks with a rate in each', async ({ page }) => {
  await setWeekStats('guest-a', { choresCompleted: 1, meetingsAttended: 3 });
  await signInAs(page, 'manager');
  await page.locator('#nav-reports').click();
  await expect(page.getByTestId('compliance-section')).toBeVisible({ timeout: 20_000 });
  const weeks = page.locator('[data-testid^="week-row-"]');
  await expect(weeks).toHaveCount(4);
  for (const row of await weeks.all()) await expect(row).toContainText(/\d+%/);
});

// Phone defect #249: summaries are keyed by their Monday (the
// server's weekStartFor and useCurrentWeek), but getComplianceTrend looks them up
// by Sunday-anchored week starts, so the 4-week compliance is always 0%.
test.fail("the 4-week compliance counts this week's summaries", async ({ page }) => {
  await setWeekStats('guest-a', { choresCompleted: 1, meetingsAttended: 3 });
  // The rates the phone's getComplianceTrend would give this week (Monday-keyed).
  const active = await activeCount();
  const week = (await admin().collection('week-summaries').where('houseId', '==', HOUSE).where('startDate', '==', weekStart()).get()).docs.map((d) => d.data().stats);
  const rate = (met: number) => `${Math.round((met / active) * 100)}%`;
  const expected = [rate(week.filter((st) => st.choresCompleted > 0).length), rate(week.filter((st) => st.meetingsAttended >= 3).length)];
  await signInAs(page, 'manager');
  await page.locator('#nav-reports').click();
  await expect(page.getByTestId('compliance-section')).toBeVisible({ timeout: 20_000 });
  const weeks = page.locator('[data-testid^="week-row-"]');
  await expect(weeks).toHaveCount(4);
  // innerText keeps the cells apart; textContent runs a date into its rate.
  const rates = () => weeks.evaluateAll((rows) => rows.flatMap((r) => (r as HTMLElement).innerText.split(/\s+/)));
  await expect.poll(async () => (await rates()).filter((cell) => /^[1-9]\d*%$/.test(cell)), { timeout: 10_000 })
    .toEqual(expected);
});

test('a peer leader gets neither the report nor the export', async ({ page }) => {
  await makePeerLeader('manager');
  await signInAs(page, 'manager');
  await page.goto(`/houses/${HOUSE}/reports`);
  await expect(page.getByText("This page isn't available for your role.")).toBeVisible({
    timeout: 20_000,
  });
  // The button waits on the tier check, so assert only once it has answered.
  const tiers = page.waitForResponse((r) => r.url().includes('myHouseTiers'));
  await page.goto(RECORD);
  await tiers;
  await expect(page.getByTestId('record-header')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Discharge')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(exportButton(page)).toHaveCount(0);
});

test("exporting a resident's compliance report opens the phone's report to print", async ({
  page,
}) => {
  // The Default phase requires a chore and a sponsor meeting, and no meetings or work.
  await setWeekStats('guest-a', {
    meetingsAttended: 2,
    choresCompleted: 0,
    hoursWorked: 5,
    primarySupporterMet: 1,
  });
  await openRecord(page);
  await exportButton(page).click();
  const body = printView(page).locator('body');
  await expect(body).toContainText('Weekly Compliance Report', { timeout: 15_000 });
  await expect(body).toContainText('Resident: Test GuestA');
  await expect(body).toContainText(`Week of: ${format(parseISO(weekStart()), 'MMMM d, yyyy')}`);
  await expect(body).toContainText('Phase: Default');
  const row = (name: string) => printView(page).locator('tr', { hasText: name });
  await expect(row('Meetings')).toHaveText(/Meetings\s*0\s*2\s*PASS/);
  await expect(row('Chores')).toHaveText(/Chores\s*1\s*0\s*FAIL/);
  await expect(row('Work Hours')).toHaveText(/Work Hours\s*0\s*5\s*PASS/);
  await expect(row('Medication')).toHaveText(/Medication\s*N\/A\s*No\s*PASS/);
  await expect(row('Sponsor Meeting')).toHaveText(/Sponsor Meeting\s*Required\s*Yes\s*PASS/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('with no week data the export says so', async ({ page }) => {
  const summaries = await admin()
    .collection('week-summaries')
    .where('guestId', '==', 'guest-a')
    .get();
  await Promise.all(summaries.docs.map((d) => d.ref.delete()));
  await openRecord(page);
  await exportButton(page).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'Unable to generate report: missing guest or week data.',
    {
      timeout: 15_000,
    },
  );
  await expect(page.locator('[data-testid="print-view"]')).toHaveCount(0);
});

test("a name with markup doesn't run in the print view", async ({ page }) => {
  await admin().doc('guests/guest-a').update({
    firstName: '<img src=x onerror="parent.__xss=1;window.__xss=1">',
  });
  await setWeekStats('guest-a', { choresCompleted: 1 });
  await openRecord(page);
  await exportButton(page).click();
  await expect(printView(page).locator('body')).toContainText('Weekly Compliance Report', {
    timeout: 15_000,
  });
  // The name prints as the text it is.
  await expect(printView(page).locator('body')).toContainText('Resident: <img src=x onerror=');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:srcdoc');
  expect(frame, 'the print view is still the report').toBeDefined();
});

test("a week's figure that isn't a number prints as such and fails", async ({ page }) => {
  await setWeekStats('guest-a', { hoursWorked: '<b>5</b>' as unknown as number, choresCompleted: 1 });
  await openRecord(page);
  await exportButton(page).click();
  const body = printView(page).locator('body');
  await expect(body).toContainText('Weekly Compliance Report', { timeout: 15_000 });
  await expect(printView(page).locator('tr', { hasText: 'Work Hours' })).toHaveText(/Work Hours\s*0\s*NaN\s*FAIL/);
});
