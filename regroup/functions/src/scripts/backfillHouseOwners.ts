/**
 * Pass 1 of scripts/backfillHouseRoles: primary owner records.
 *
 * No single house field is trustworthy: before #103's rules any member could
 * write superAdminId, and a superAdmin co-owner could rewrite BOTH
 * superAdminId and ownerId until #145's rules deploy. So a primary is written
 * only when server-written evidence agrees with both fields:
 *   - superAdminId and ownerId are set and equal (uid U);
 *   - U's users/{U}.subscriptionMetadata (server-owned: a client can create it
 *     only with an empty status) has a non-empty status and lists the house in
 *     its houses map, and no other account's subscription lists it;
 *   - U holds a live superAdmin claim for the house (claims are server-set).
 * Otherwise nothing is written and the house is listed with the evidence
 * ("owner must choose"); the owner settles it on a later run with
 * --primary houseId=uid. Residual risk, for the owner's review of the list:
 * before #103 updateSubscriptionHouses added any house id to the caller's map
 * unchecked, so a co-owner who rewrote both fields AND added the house to
 * their own paid subscription, in a house whose owner's subscription does not
 * list it, would still pass. Existing primary records are re-checked against
 * the same evidence and any mismatch is reported, never changed.
 */
import type { RoleBackfillReport } from './backfillHouseRoles';

type Claims = Record<string, unknown>;
type Doc = Record<string, unknown>;

export const houseKeys = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object') return Object.keys(v as Doc);
  return [];
};

export interface OwnerEvidence {
  /** houseId -> accounts whose server-written subscription lists the house. */
  subscribers: Map<string, string[]>;
  /** houseId -> accounts holding a live superAdmin claim for the house. */
  superAdmins: Map<string, string[]>;
}

const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function collectOwnerEvidence(
  db: FirebaseFirestore.Firestore,
  claimsOf: Map<string, Claims>,
): Promise<OwnerEvidence> {
  const ev: OwnerEvidence = { subscribers: new Map(), superAdmins: new Map() };
  for (const d of (await db.collection('users').get()).docs) {
    const sm = (d.data() ?? {}).subscriptionMetadata as Doc | undefined;
    if (!sm || !str(sm.status)) continue;
    for (const h of houseKeys(sm.houses)) push(ev.subscribers, h, d.id);
  }
  for (const [uid, c] of claimsOf) {
    for (const h of houseKeys(c.superAdmin)) push(ev.superAdmins, h, uid);
  }
  return ev;
}

/** The primary owner the evidence supports for a house, or why none (ids only). */
export function ownerOf(
  houseId: string,
  house: Doc,
  ev: OwnerEvidence,
): { uid?: string; reason: string } {
  const sa = str(house.superAdminId);
  const oid = str(house.ownerId);
  const subs = ev.subscribers.get(houseId) ?? [];
  const supers = ev.superAdmins.get(houseId) ?? [];
  const evidence =
    `superAdminId=${sa || '-'} ownerId=${oid || '-'} ` +
    `subscription=[${subs.join(',')}] superAdmin-claims=[${supers.join(',')}]`;
  const choose = (why: string) => ({ reason: `${why}; owner must choose (${evidence})` });
  if (!sa || !oid) return choose('superAdminId or ownerId missing');
  if (sa !== oid) return choose('superAdminId and ownerId differ');
  if (subs.length !== 1 || subs[0] !== sa) {
    return choose('no subscription of that account alone lists the house');
  }
  if (!supers.includes(sa)) return choose('that account holds no superAdmin claim here');
  return { uid: sa, reason: `fields, subscription and claim agree (${evidence})` };
}

/** --primary houseId=uid, repeatable: the owner's settlement of a listed house. */
export function parsePrimaryChoices(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  argv.forEach((a, i) => {
    if (a !== '--primary') return;
    const [house, uid] = (argv[i + 1] ?? '').split('=');
    if (house && uid) out[house] = uid;
  });
  return out;
}

export async function primaryOwnerPass(
  db: FirebaseFirestore.Firestore,
  ctx: {
    houses: Map<string, Doc>;
    /** houseId -> uids holding a primary record already. */
    primaries: Map<string, string[]>;
    claimsOf: Map<string, Claims>;
    choices: Record<string, string>;
    apply: boolean;
    record: (houseId: string) => Doc;
    report: RoleBackfillReport;
  },
): Promise<void> {
  const { report } = ctx;
  const ev = await collectOwnerEvidence(db, ctx.claimsOf);
  for (const [houseId, house] of ctx.houses) {
    const existing = ctx.primaries.get(houseId) ?? [];
    const choice = ctx.choices[houseId];
    const found = ownerOf(houseId, house, ev);
    if (existing.length > 0) {
      // Re-check, never change: a wrong primary is removed by hand.
      const expected = choice ?? found.uid;
      if (existing.length > 1 || existing[0] !== expected) {
        report.primaryMismatch.push({
          houseId,
          uid: existing.join(','),
          reason: choice
            ? `owner chose ${choice}`
            : found.uid
              ? `evidence names ${found.uid}`
              : found.reason,
        });
      }
      continue;
    }
    let owner = found.uid;
    let reason = found.reason;
    if (choice) {
      if (!ctx.claimsOf.has(choice)) {
        report.ownerReview.push({
          houseId,
          reason: `chosen ${choice} has no account; ${found.reason}`,
        });
        continue;
      }
      owner = choice;
      reason = 'owner-chose (--primary)';
    }
    if (!owner) {
      report.ownerReview.push({ houseId, reason });
      continue;
    }
    report.owners.push({ uid: owner, houseId, tier: 'owner', reason });
    if (ctx.apply)
      await db.collection('house-roles').doc(`${houseId}_${owner}`).set(ctx.record(houseId));
  }
}
