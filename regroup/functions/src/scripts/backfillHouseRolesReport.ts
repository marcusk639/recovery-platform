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
  console.log(
    `Recent callable grants left to the stale pass of a later run: ${report.recentSkipped}`,
  );
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
      '\nNo primary owner written (exit code 3); owner must choose, then re-run with\n' +
        '--primary houseId=uid:',
    );
    for (const h of report.ownerReview) console.log(`${h.houseId}\t${h.reason}`);
  }
  if (report.primaryContradicted.length > 0) {
    console.log(
      '\nExisting primary records the evidence CONTRADICTS (it names another account; left as\n' +
        'they are, exit code 3). The owner decides; if one is wrong, remove it by hand and\n' +
        're-run with --primary houseId=uid:\nhouseId\tprimary\treason',
    );
    for (const m of report.primaryContradicted) console.log(`${m.houseId}\t${m.uid}\t${m.reason}`);
  }
  if (report.primaryUnverifiable.length > 0) {
    console.log(
      '\nExisting primary records the evidence can neither confirm nor contradict. Review,\n' +
        'do not delete (e.g. a createHouses record whose claim grant failed):\nhouseId\tprimary\treason',
    );
    for (const m of report.primaryUnverifiable) console.log(`${m.houseId}\t${m.uid}\t${m.reason}`);
  }
  if (!apply) console.log('\nNothing was written. Re-run with --apply to commit.');
}

/**
 * 2: claims lookups failed (re-run); 3: houses or primaries need the owner
 * (listed, contradicted or unverifiable); else 0.
 */
export function exitCodeFor(report: RoleBackfillReport): number {
  if (report.lookupFailed.length > 0) return 2;
  const owner = [report.ownerReview, report.primaryContradicted, report.primaryUnverifiable];
  if (owner.some((rows) => rows.length > 0)) return 3;
  return 0;
}
