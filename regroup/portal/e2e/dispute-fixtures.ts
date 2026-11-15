// Dispute test data, and probes that call the phone's own dispute services
// inside the portal (window.__portalTest.disputes, e2e builds only).
import type { Page } from '@playwright/test';
import type { DocumentData } from 'firebase-admin/firestore';
import { admin, expect } from './helpers';

export const HOUSE = 'test-house-123';
// The seed's guest-a chore, disputed by guest-b.
export const DISPUTED = 'test-activity-123';
// The seed's guest-b chore, active.
export const ACTIVE = 'test-activity-b1';
// Guest-b chores the owner (e2e-manager) logged.
export const OP_LOGGED = 'p6-operator-logged';
export const OP_LOGGED_ACTIVE = 'p6-operator-logged-active';

export type ProbeResult = { ok: true } | { ok: false; message: string; code?: string };
type Op = 'raise' | 'decide' | 'reopen';

const activity = (id: string) => admin().doc(`activities/${id}`);
export const activityData = async (id: string): Promise<DocumentData> =>
  (await activity(id).get()).data()!;

// useActivities drops activities from UTC Sunday until Monday (reported to the
// owner as a phone bug), so use a time that is never a UTC Sunday.
export async function moveOffUtcSunday(id: string): Promise<void> {
  const at = new Date();
  at.setUTCDate(at.getUTCDate() - (at.getUTCDay() === 0 ? 1 : 0));
  at.setUTCHours(0, 30, 0, 0);
  await activity(id).update({ timestamp: at, loggedAt: at });
}

// A copy of the seed's guest-b chore with `fields` applied.
export async function putActivity(id: string, fields: object): Promise<void> {
  const base = await activityData(ACTIVE);
  await activity(id).set({ ...base, id, ...fields });
  await moveOffUtcSunday(id);
}

export const operatorLogged = (status: 'disputed' | 'active') =>
  putActivity(status === 'disputed' ? OP_LOGGED : OP_LOGGED_ACTIVE, {
    loggedBy: 'e2e-manager',
    ...(status === 'disputed'
      ? {
          status,
          disputeReason: 'Not done.',
          disputedBy: 'e2e-guest-a',
          disputeResolvedBy: 'e2e-guest-a',
          disputedAt: new Date(),
        }
      : {}),
  });

// Server triggers write to new activities for a moment; wait until a doc stops changing.
export async function settled(id: string): Promise<DocumentData> {
  let last = JSON.stringify(await activityData(id));
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const now = JSON.stringify(await activityData(id));
    if (now === last) return activityData(id);
    last = now;
  }
  throw new Error(`activity ${id} kept changing`);
}

// The server's decision log. Ids carry their time in milliseconds.
export const decisionIds = async (id: string, sinceMs: number): Promise<string[]> =>
  (await activity(id).collection('dispute-decisions').get()).docs
    .map((d) => d.id)
    .filter((d) => Number(d.split('_')[1]) >= sinceMs - 1000);

export const waitForDecisions = (id: string, sinceMs: number, count: number) =>
  expect
    .poll(() => decisionIds(id, sinceMs).then((ids) => ids.length), { timeout: 15_000 })
    .toBe(count);

export async function probe(page: Page, op: Op, ...args: unknown[]): Promise<any> {
  await page.waitForFunction(() => (window as any).__portalTest?.uid?.());
  return page.evaluate(({ op, args }) => (window as any).__portalTest.disputes[op](...args), {
    op,
    args,
  });
}

export const refused = (message: string) => ({ ok: false, message });

export async function moneySnapshot(houseId = HOUSE) {
  const guests: Record<string, { rentOwed?: number; choreFees?: number }> = {};
  for (const g of (await admin().collection('guests').where('houseId', '==', houseId).get()).docs) {
    guests[g.id] = { rentOwed: g.get('rentOwed'), choreFees: g.get('choreFees') };
  }
  const payments: Record<string, DocumentData> = {};
  for (const p of (await admin().collection('payments').get()).docs) payments[p.id] = p.data();
  return { guests, payments };
}
