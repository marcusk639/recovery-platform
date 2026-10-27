/**
 * Helpers for scripts/backfillHouseRoles: the manager evidence check and the
 * printed report (ids, tiers and reasons only).
 */
import type { RoleBackfillReport, RoleBackfillRow } from './backfillHouseRoles';

/** Listed in the house's adminIds through an admins doc of the account, or invited as admin by the owner. */
export async function listedOrOwnerGranted(
  db: FirebaseFirestore.Firestore,
  uid: string,
  houseId: string,
  house: Record<string, unknown>,
): Promise<boolean> {
  const adminIds = Array.isArray(house.adminIds) ? (house.adminIds as unknown[]) : [];
  const adminDocs = (await db.collection('admins').where('userId', '==', uid).get()).docs;
  if (adminDocs.some((d) => adminIds.includes(d.id))) return true;
  const invites = (await db.collection('invitations').where('redeemedByUid', '==', uid).get()).docs;
  return invites.some((d) => {
    const inv = d.data() ?? {};
    return inv.houseId === houseId && inv.role === 'admin' && inv.inviterUid === house.superAdminId;
  });
}

export function printRoleReport(report: RoleBackfillReport, apply: boolean): void {
  const rows = (title: string, list: RoleBackfillRow[]) => {
    if (list.length === 0) return;
    console.log(`\n${title}\nuid\thouseId\ttier\treason`);
    for (const r of list) console.log(`${r.uid}\t${r.houseId}\t${r.tier}\t${r.reason}`);
  };
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}: house-roles records`);
  console.log(`Existing records left alone: ${report.existing}`);
  console.log(`Redeemed invitations marked completed: ${report.invitationsStamped}`);
  console.log(`Records ${apply ? 'stamped' : 'to stamp'} with houseId: ${report.houseIdsToStamp}`);
  rows(
    `Primary owners ${apply ? 'written' : 'to write'} (evidence agrees, or --primary):`,
    report.owners,
  );
  rows(`Staff records ${apply ? 'written' : 'to write'}:`, report.toWrite);
  rows(
    'Recorded as peerLeader (least privilege); owner to review. Promote real managers by\n' +
      'sending them an admin invitation, or: npm run roles:promote-manager -- --house H --uid U',
    report.review,
  );
  rows(
    `Stale records ${apply ? 'lowered/removed' : 'to lower/remove'} (claims gone):`,
    report.stale,
  );
  rows(
    'Claims lookup FAILED; records left as they are, re-run (exit code 2):',
    report.lookupFailed,
  );
  if (report.ownerReview.length > 0) {
    console.log(
      '\nNo primary owner written; owner must choose, then re-run with --primary houseId=uid:',
    );
    for (const h of report.ownerReview) console.log(`${h.houseId}\t${h.reason}`);
  }
  if (report.primaryMismatch.length > 0) {
    console.log(
      '\nExisting primary records the evidence does not support (left as they are; remove a\n' +
        'wrong one by hand, then re-run with --primary houseId=uid):\nhouseId\tprimary\treason',
    );
    for (const m of report.primaryMismatch) console.log(`${m.houseId}\t${m.uid}\t${m.reason}`);
  }
  if (!apply) console.log('\nNothing was written. Re-run with --apply to commit.');
}
