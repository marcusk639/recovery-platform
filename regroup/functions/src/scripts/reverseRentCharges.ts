/**
 * Reverse rent charges by their records (spec §5, the stop switch's partner).
 *
 * For each selected rentCharges doc, newest first per resident, one transaction
 * lowers rentOwed by its amount, moves rentAccounts.chargedThrough back to the day
 * before it (only when that is still the charge's last day), copies it to
 * rentChargeReversals/{id}_{nowMs}, and deletes it, so its days can be charged again.
 *
 * Dry run is the DEFAULT — writing requires --apply. --apply is refused unless
 * config/rentCharges.paused is true or the house has charging off: otherwise the
 * next hourly run would charge the same days straight back.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/scripts/reverseRentCharges.js --house=H
 *   node lib/scripts/reverseRentCharges.js --house=H [--since=YYYY-MM-DD] [--guest=ID]
 *   node lib/scripts/reverseRentCharges.js --house=H ... --apply
 *
 * Prints counts and totals only — never names or per-resident amounts.
 */
import './scriptBootstrap';
import { FieldValue } from 'firebase-admin/firestore';
import { addDays } from '../activities/weekSummaryMath';
import {
  guestCollection,
  houseCollection,
  ratsFirestore,
  rentAccountCollection,
  rentChargeCollection,
  rentChargeReversalCollection,
  rentConfigRef,
} from '../api/firestore';
import { rentSettingsOf } from '../rent/rate';
import { addCents, asCents, Cents, formatCents } from '../util/money';

type Data = Record<string, unknown>;

export interface ReverseOptions {
  houseId: string;
  since?: string;
  guestId?: string;
  apply: boolean;
}
export interface ReverseResult {
  charges: number;
  totalCents: Cents;
  refused?: 'not-paused';
}

async function chargingStopped(houseId: string): Promise<boolean> {
  const config = await rentConfigRef().get();
  if (config.exists && config.data()?.paused === true) return true;
  const house = await houseCollection.doc(houseId).get();
  return !house.exists || rentSettingsOf((house.data() ?? {}) as Data) === null;
}

async function reverseOne(chargeId: string, nowMs: number): Promise<number> {
  return ratsFirestore.runTransaction(async (txn) => {
    const chargeRef = rentChargeCollection.doc(chargeId);
    const charge = await txn.get(chargeRef);
    if (!charge.exists) return 0;
    const c = (charge.data() ?? {}) as Data;
    const amount = typeof c.amountCents === 'number' ? c.amountCents : 0;
    // A linked intake record's balance and account moved to its invite record
    // (rent/linkIntakeRecord), so the reversal applies there.
    const chargedId = String(c.guestId);
    const charged = await txn.get(guestCollection.doc(chargedId));
    const linkedTo = charged.data()?.rentLinkedTo;
    const guestId = typeof linkedTo === 'string' && linkedTo !== '' ? linkedTo : chargedId;
    const guestRef = guestCollection.doc(guestId);
    const accountRef = rentAccountCollection.doc(guestId);
    const [guest, acct] = await txn.getAll(guestRef, accountRef);
    if (guest.exists && amount !== 0) {
      txn.update(guestRef, { rentOwed: FieldValue.increment(-amount) });
    }
    if (acct.exists && acct.data()?.chargedThrough === c.through && typeof c.from === 'string') {
      txn.update(accountRef, { chargedThrough: addDays(c.from, -1), updatedAtMs: nowMs });
    }
    txn.set(rentChargeReversalCollection.doc(`${chargeId}_${nowMs}`), {
      ...c,
      chargeId,
      reversedAtMs: nowMs,
    });
    txn.delete(chargeRef);
    return amount;
  });
}

export async function reverseRentCharges(opts: ReverseOptions): Promise<ReverseResult> {
  if (opts.apply && !(await chargingStopped(opts.houseId))) {
    return { charges: 0, totalCents: asCents(0), refused: 'not-paused' };
  }
  const snap = await rentChargeCollection.where('houseId', '==', opts.houseId).get();
  const selected = snap.docs
    .map((d) => ({ id: d.id, data: (d.data() ?? {}) as Data }))
    .filter((d) => !opts.since || String(d.data.from) >= opts.since)
    .filter((d) => !opts.guestId || d.data.guestId === opts.guestId)
    // Newest first per resident: guest ascending, then first day descending.
    .sort((a, b) =>
      String(a.data.guestId) === String(b.data.guestId)
        ? String(b.data.from).localeCompare(String(a.data.from))
        : String(a.data.guestId).localeCompare(String(b.data.guestId)),
    );
  let total = asCents(0);
  for (const d of selected) {
    const amount = opts.apply
      ? await reverseOne(d.id, Date.now())
      : typeof d.data.amountCents === 'number'
        ? d.data.amountCents
        : 0;
    total = addCents(total, asCents(amount));
  }
  return { charges: selected.length, totalCents: total };
}

function arg(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const houseId = arg(argv, 'house');
  if (!houseId)
    throw new Error(
      'usage: reverseRentCharges --house=ID [--since=YYYY-MM-DD] [--guest=ID] [--apply]',
    );
  const apply = argv.includes('--apply');
  const result = await reverseRentCharges({
    houseId,
    since: arg(argv, 'since'),
    guestId: arg(argv, 'guest'),
    apply,
  });
  if (result.refused) {
    console.log('Refused: set config/rentCharges.paused = true (or turn charging off) first.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `${apply ? 'Reversed' : 'Would reverse'} ${result.charges} charge(s), ${formatCents(result.totalCents)} in total.`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
