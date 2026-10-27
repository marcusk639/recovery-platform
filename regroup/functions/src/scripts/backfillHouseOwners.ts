/**
 * Pass 1 of scripts/backfillHouseRoles: primary owner records.
 *
 * Threat model. Since #103 no client may write superAdminId, and step 0 of
 * the deploy order makes post-#103 live rules a precondition; before #145's
 * rules deploy a superAdmin co-owner can still rewrite ownerId. So a co-owner
 * C holds both fields only if C set superAdminId before #103. The house
 * fields cannot tell C from the owner; the subscription is the only evidence
 * that can, and C could list the house on their own subscription by three
 * routes: before #59 (c4b75501) users/{uid} was writable by its owner, so any
 * account could write its own subscriptionMetadata.status and houses; before
 * #103 C could delete and recreate their users doc with a houses map, which
 * writeOperatorSubscription keeps; and updateSubscriptionHouses added any
 * house unchecked before #103 and, until the functions deploy, adds any
 * house whose ownerId is the caller (which C can set). So a primary is
 * written only when ALL of these hold:
 *   - superAdminId and ownerId are set and equal (uid U);
 *   - U's users/{U}.subscriptionMetadata has a non-empty status and lists the
 *     house, and no other account's subscription lists it;
 *   - U holds a live superAdmin claim for the house, and no other account
 *     does (a co-owner always holds one, so any house with a co-owner waits
 *     for the owner).
 * Otherwise nothing is written and the house is listed with the evidence
 * ("owner must choose"); the owner settles it on a later run with
 * --primary houseId=uid (the record is marked chosen and never re-checked).
 * What still slips through: a sole superAdmin-claim holder C who already
 * removed the real owner's claim; that owner has lost the house without
 * this PR too. Existing primary records (not chosen) are re-checked: one the
 * evidence contradicts (it names another account) is reported; one it can
 * neither confirm nor contradict is listed for review, never for deletion.
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
  // A co-owner always holds a superAdmin claim: see the header.
  if (supers.length > 1) return choose('more than one account holds a superAdmin claim here');
  return { uid: sa, reason: `fields, subscription and claim agree (${evidence})` };
}

/**
 * --primary houseId=uid, repeatable: the owner's settlement of a listed house.
 * Throws (the script exits 1) on a malformed flag, a missing value, a value
 * that is another flag, or the same house twice.
 */
export function parsePrimaryChoices(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  argv.forEach((a, i) => {
    if (a.startsWith('--primary=')) throw new Error('use --primary houseId=uid (a space, not =)');
    if (a !== '--primary') return;
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) throw new Error('--primary needs a houseId=uid value');
    const parts = v.split('=');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`--primary value is not houseId=uid: ${v}`);
    }
    if (parts[0] in out) throw new Error(`--primary names house ${parts[0]} twice`);
    out[parts[0]] = parts[1];
  });
  return out;
}

/**
 * All houses, after checking every --primary choice names an existing house
 * and an existing account; throws otherwise (the script exits 1, before any
 * write).
 */
export async function housesCheckingChoices(
  db: FirebaseFirestore.Firestore,
  choices: Record<string, string>,
  claimsOf: Map<string, Claims>,
): Promise<Map<string, Doc>> {
  const houses = new Map<string, Doc>();
  for (const h of (await db.collection('houses').get()).docs) houses.set(h.id, h.data() ?? {});
  const bad = Object.entries(choices)
    .filter(([h, uid]) => !houses.has(h) || !claimsOf.has(uid))
    .map(([h, uid]) => `${h}=${uid}`);
  if (bad.length > 0)
    throw new Error(`--primary names an unknown house or account: ${bad.join(',')}`);
  return houses;
}

/** An existing primary record: its account and whether the owner chose it. */
export interface PrimaryRecord {
  uid: string;
  chosen: boolean;
}

export async function primaryOwnerPass(
  db: FirebaseFirestore.Firestore,
  ctx: {
    houses: Map<string, Doc>;
    /** houseId -> primary records already there. */
    primaries: Map<string, PrimaryRecord[]>;
    claimsOf: Map<string, Claims>;
    choices: Record<string, string>;
    apply: boolean;
    record: (houseId: string, chosen: boolean) => Doc;
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
      // Re-check, never change. An owner-chosen record is not re-checked.
      const uids = existing.map((p) => p.uid).join(',');
      const contradicted = (reason: string) =>
        report.primaryContradicted.push({ houseId, uid: uids, reason });
      if (existing.length > 1) contradicted('several primary records');
      else if (choice && choice !== existing[0].uid) {
        contradicted(`owner chose ${choice}; remove the existing record first`);
      } else if (choice && !existing[0].chosen) {
        // The owner confirms the existing record: mark it chosen (settled).
        const { chosen, chosenAt } = ctx.record(houseId, true);
        report.owners.push({
          uid: choice,
          houseId,
          tier: 'owner',
          reason: 'owner-chose (--primary): existing record',
        });
        if (ctx.apply) {
          await db
            .collection('house-roles')
            .doc(`${houseId}_${choice}`)
            .update({ chosen, chosenAt });
        }
      } else if (choice || existing[0].chosen || found.uid === existing[0].uid) continue;
      else if (found.uid) contradicted(`evidence names ${found.uid}`);
      else report.primaryUnverifiable.push({ houseId, uid: uids, reason: found.reason });
      continue;
    }
    let owner = found.uid;
    let reason = found.reason;
    if (choice) {
      // housesCheckingChoices already refused a choice with no account.
      owner = choice;
      reason = 'owner-chose (--primary)';
    }
    if (!owner) {
      report.ownerReview.push({ houseId, reason });
      continue;
    }
    report.owners.push({ uid: owner, houseId, tier: 'owner', reason });
    if (ctx.apply) {
      await db
        .collection('house-roles')
        .doc(`${houseId}_${owner}`)
        .set(ctx.record(houseId, !!choice));
    }
  }
}
