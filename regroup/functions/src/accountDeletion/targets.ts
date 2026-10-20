import { adminCollection, guestCollection, houseCollection, ratsFirestore } from '../api/firestore';

/**
 * What the run will act on, captured on the first run. The "members" step
 * deletes the guest docs that "personal" still needs (guest ids and houses for
 * Storage paths), so a resumed run must keep the stored ids rather than rely on
 * a re-query alone; see `mergeTargets`. `archivedGuestIds` and
 * `guestCustomerIds` are kept optional defensively.
 */
export interface DeletionTargets {
  guestIds: string[];
  houseIdsByGuest: Record<string, string>;
  adminIds: string[];
  ownsHouses: boolean;
  hasSubscription: boolean;
  /** `guest-archive` docs still linked to the user (former residents). */
  archivedGuestIds?: string[];
  /** Platform Stripe customers created for the user's rent autopay. */
  guestCustomerIds?: string[];
}

export interface TargetUser {
  id: string;
  guestId?: string;
  adminId?: string;
  subscriptionMetadata?: { subscriptionId?: string; customerId?: string };
}

type Doc = { id: string; exists?: boolean; data(): unknown };

const dedupe = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

/**
 * The doc named by a `users/{uid}` pointer, when it exists but carries no
 * `userId` (legacy records). Docs linked to another user are ignored.
 */
async function unlinkedDoc(
  collection: { doc(id: string): { get(): Promise<Doc> } },
  id: string | undefined,
): Promise<Doc | undefined> {
  if (!id) return undefined;
  const snap = await collection.doc(id).get();
  if (!snap.exists) return undefined;
  const data = (snap.data() ?? {}) as { userId?: unknown };
  return data.userId ? undefined : snap;
}

export async function snapshotTargets(uid: string, user: TargetUser): Promise<DeletionTargets> {
  const [guests, admins, owned, superAdmin, archived, legacyGuest, legacyAdmin] = await Promise.all(
    [
      guestCollection.where('userId', '==', uid).get(),
      adminCollection.where('userId', '==', uid).get(),
      houseCollection.where('ownerId', '==', uid).get(),
      houseCollection.where('superAdminId', '==', uid).get(),
      ratsFirestore.collection('guest-archive').where('userId', '==', uid).get(),
      unlinkedDoc(guestCollection, user.guestId),
      unlinkedDoc(adminCollection, user.adminId),
    ],
  );

  const guestDocs: Doc[] = [...guests.docs, ...(legacyGuest ? [legacyGuest] : [])];
  const adminDocs: Doc[] = [...admins.docs, ...(legacyAdmin ? [legacyAdmin] : [])];
  const houseIdsByGuest: Record<string, string> = {};
  const guestCustomerIds: string[] = [];
  for (const doc of [...guestDocs, ...archived.docs]) {
    const data = (doc.data() ?? {}) as { houseId?: string; stripeCustomerId?: string };
    // Current guest docs come first, so their house wins over a stale archive copy.
    if (data.houseId && !houseIdsByGuest[doc.id]) houseIdsByGuest[doc.id] = data.houseId;
    if (data.stripeCustomerId) guestCustomerIds.push(data.stripeCustomerId);
  }

  const guestIds = dedupe(guestDocs.map((d) => d.id));
  const { subscriptionId, customerId } = user.subscriptionMetadata ?? {};
  return {
    guestIds,
    houseIdsByGuest,
    adminIds: dedupe(adminDocs.map((d) => d.id)),
    ownsHouses: !owned.empty || !superAdmin.empty,
    hasSubscription: Boolean(subscriptionId || customerId),
    archivedGuestIds: dedupe(archived.docs.map((d) => d.id)).filter((id) => !guestIds.includes(id)),
    guestCustomerIds: dedupe(guestCustomerIds),
  };
}

/**
 * On resume: the stored snapshot plus anything a fresh snapshot finds that was
 * created since the first attempt. Stored ids are kept (their docs may already
 * be deleted, which is why the snapshot is stored) and the stored house wins
 * for a guest. Steps already completed do not re-run, so only steps still to
 * run act on the additions.
 */
export function mergeTargets(stored: DeletionTargets, fresh: DeletionTargets): DeletionTargets {
  const guestIds = dedupe([...stored.guestIds, ...fresh.guestIds]);
  return {
    guestIds,
    houseIdsByGuest: { ...fresh.houseIdsByGuest, ...stored.houseIdsByGuest },
    adminIds: dedupe([...stored.adminIds, ...fresh.adminIds]),
    ownsHouses: stored.ownsHouses || fresh.ownsHouses,
    hasSubscription: stored.hasSubscription || fresh.hasSubscription,
    archivedGuestIds: dedupe([
      ...(stored.archivedGuestIds ?? []),
      ...(fresh.archivedGuestIds ?? []),
    ]).filter((id) => !guestIds.includes(id)),
    guestCustomerIds: dedupe([
      ...(stored.guestCustomerIds ?? []),
      ...(fresh.guestCustomerIds ?? []),
    ]),
  };
}
