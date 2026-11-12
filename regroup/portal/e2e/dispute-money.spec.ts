// Owner decision (2026-11-10): disputes have no effect on money or payments.
import type { Page } from '@playwright/test';
import { expect, reseed, signInAs, test } from './helpers';
import {
  ACTIVE,
  DISPUTED,
  decisionIds,
  moneySnapshot,
  moveOffUtcSunday,
  probe,
  waitForDecisions,
} from './dispute-fixtures';

let startedAt = 0;
test.beforeEach(async () => {
  reseed();
  await moveOffUtcSunday(DISPUTED);
  await moveOffUtcSunday(ACTIVE);
  startedAt = Date.now();
});

// Waits until the server has stopped logging decisions, so its triggers have run.
async function quiet(ids: string[]) {
  const count = async () =>
    (await Promise.all(ids.map((id) => decisionIds(id, startedAt)))).flat().length;
  let last = -1;
  for (let i = 0; i < 12; i++) {
    const now = await count();
    if (now === last) return;
    last = now;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('decisions kept arriving');
}

test('disputes never change money', async ({ page }) => {
  const before = await moneySnapshot();
  expect(Object.keys(before.payments)).toHaveLength(3);
  expect(Object.keys(before.guests).length).toBeGreaterThanOrEqual(2);
  await signInAs(page, 'manager');
  expect(await probe(page, 'raise', ACTIVE, 'Not done')).toEqual({ ok: true });
  expect(await probe(page, 'decide', ACTIVE, 'approve')).toEqual({ ok: true });
  await waitForDecisions(ACTIVE, startedAt, 1);
  expect(await probe(page, 'reopen', ACTIVE)).toEqual({ ok: true });
  expect(await probe(page, 'decide', ACTIVE, 'reject')).toEqual({ ok: true });
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  await quiet([ACTIVE, DISPUTED]);
  // Approve, reopen, reject on one; approve on the other.
  expect(await decisionIds(ACTIVE, startedAt)).toHaveLength(3);
  expect(await decisionIds(DISPUTED, startedAt)).toHaveLength(1);
  expect(await moneySnapshot()).toEqual(before);
});

async function paymentFigures(page: Page): Promise<string> {
  await page.click('#nav-payments');
  await page.getByText('All Time', { exact: true }).click();
  const card = page.getByTestId('payment-stats-card');
  await expect(card).toContainText('$');
  await expect(card).not.toContainText('NaN');
  return card.innerText();
}

test('the payments page reads the same after a decision', async ({ page }) => {
  await signInAs(page, 'manager');
  const before = await paymentFigures(page);
  await page.click('#nav-disputes');
  await page.getByTestId(`resolve-dispute-button-${DISPUTED}`).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId(`undo-dispute-decision-button-${DISPUTED}`)).toBeVisible();
  await waitForDecisions(DISPUTED, startedAt, 1);
  expect(await paymentFigures(page)).toBe(before);
});
