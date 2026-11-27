/**
 * previewRentCharges: what each current resident would be charged if the house saved
 * this schedule and price (rent spec §5, "turning charging on shows a preview first").
 *
 * Managers and above only (house tier owner or manager, the rules' rank >= 2 that
 * guards rentFrequency / weeklyRent / monthlyRent): a peer leader also owes rent and
 * sets no prices (owner decision 2026-11-10). It computes with the same anchor and
 * charge rule as chargeResident, writes nothing, and logs no names or amounts.
 *
 * `price` is DOLLARS, exactly what the app will write to house.weeklyRent or
 * house.monthlyRent; every amount returned is integer CENTS.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import {
  guestCollection,
  houseCollection,
  ratsFirestore,
  rentAccountCollection,
  rentHouseStateCollection,
} from '../api/firestore';
import { localDateString } from '../activities/weekSummaryMath';
import { PreviewRow, previewResident } from '../rent/preview';
import { rentSettingsOf } from '../rent/rate';
import { RentAccount } from '../rent/types';
import { isActiveGuestDoc } from '../util/guestMembership';
import { houseTierOf } from '../util/houseRoles';
import { parseInput } from '../validation';

const previewSchema = z.object({
  houseId: z.string().min(1).max(128),
  frequency: z.enum(['weekly', 'monthly'], {
    message: 'Choose weekly or monthly to preview charges',
  }),
  // Dollars. The per-schedule ceiling is checked below with the server's own limits.
  price: z.number().positive('Enter a price above $0'),
});

export const previewRentCharges = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = request.auth.uid;
  const { houseId, frequency, price } = parseInput(previewSchema, request.data);

  // houseTierOf, not assertHouseMoneyStaff: the price fields' rule is callerRank >= 2,
  // which the live tier matches. assertHouseMoneyStaff also admits anyone listed in
  // the house doc's admin fields, which a peer leader can be.
  const tier = await houseTierOf(uid, houseId);
  if (tier !== 'owner' && tier !== 'manager') {
    throw new HttpsError('permission-denied', 'Only a house manager or owner can set rent');
  }

  const houseSnap = await houseCollection.doc(houseId).get();
  if (!houseSnap.exists) throw new HttpsError('not-found', 'House not found');
  const house = houseSnap.data() ?? {};
  if (house.houseType === 'oxford') {
    throw new HttpsError(
      'failed-precondition',
      'Oxford houses pay the equal expense share, not a rent price',
    );
  }

  const stateSnap = await rentHouseStateCollection.doc(houseId).get();
  const state = stateSnap.exists ? (stateSnap.data() ?? {}) : null;
  const priceField = frequency === 'weekly' ? 'weeklyRent' : 'monthlyRent';
  const proposed = rentSettingsOf(
    { ...house, rentFrequency: frequency, [priceField]: price },
    state,
  );
  if (!proposed) {
    throw new HttpsError(
      'invalid-argument',
      frequency === 'weekly'
        ? 'A weekly price must be between $0 and $2,500'
        : 'A monthly price must be between $0 and $10,000',
    );
  }

  // While charging is already on, saving keeps its start (houseRentSettings stamps
  // only when there is none); otherwise charging would start now.
  const now = new Date();
  const current = rentSettingsOf(house, state);
  const start =
    current && current.startDate !== null && current.startedAtMs !== null
      ? { startDate: current.startDate, startedAtMs: current.startedAtMs }
      : { startDate: localDateString(now, proposed.timeZone), startedAtMs: now.getTime() };

  const guests = await guestCollection.where('houseId', '==', houseId).get();
  const active = guests.docs.filter((d) => {
    const g = d.data() ?? {};
    return isActiveGuestDoc(g) && !g.rentLinkedTo;
  });
  const accounts =
    active.length === 0
      ? []
      : await ratsFirestore.getAll(...active.map((d) => rentAccountCollection.doc(d.id)));

  const residents: PreviewRow[] = [];
  let skipped = 0;
  active.forEach((guestDoc, i) => {
    const row = previewResident({
      guestId: guestDoc.id,
      guest: guestDoc.data() ?? {},
      houseId,
      account: accounts[i]?.exists ? (accounts[i].data() as Partial<RentAccount>) : null,
      createdMs: guestDoc.createTime?.toMillis() ?? now.getTime(),
      settings: { ...proposed, ...start },
      now,
    });
    if (row) residents.push(row);
    else skipped++;
  });

  logger.info('rent.preview', { houseId, frequency, residents: residents.length, skipped });
  // skipped: residents the job won't charge either (an own rate above the limit).
  return { frequency, firstChargeable: start.startDate, residents, skipped };
});
