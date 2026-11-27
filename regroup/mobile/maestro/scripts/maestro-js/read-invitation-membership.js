// Maestro runScript (runs on the host, in Maestro's JS engine): reads what
// "Accept as this account" wrote for UID from the local Firestore emulator, so
// deep-link-invitation-accept.yaml can prove the role took effect: the users
// doc flags, the admins record they point to, and the redeemed invitation.
// Emulator only: the demo- project never reaches a real one.
// env: UID, TOKEN. Sets output.userIsAdmin, output.userIsGuest,
// output.adminUserId, output.adminHouseIds (comma-joined) and
// output.invitationRedeemedBy.
const DOCS = 'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/';
function read(docPath) {
  const res = http.get(DOCS + docPath, { headers: { Authorization: 'Bearer owner' } });
  return (json(res.body) || {}).fields || {};
}
const user = read('users/' + UID);
const adminId = user.adminId ? user.adminId.stringValue : '';
const admin = adminId ? read('admins/' + adminId) : {};
const invitation = read('invitations/' + TOKEN);
const houseIds =
  admin.houseIds && admin.houseIds.arrayValue && admin.houseIds.arrayValue.values
    ? admin.houseIds.arrayValue.values.map(function (v) {
        return v.stringValue;
      })
    : [];
output.userIsAdmin = !!(user.isAdmin && user.isAdmin.booleanValue);
output.userIsGuest = !!(user.isGuest && user.isGuest.booleanValue);
output.adminUserId = admin.userId ? admin.userId.stringValue : '';
output.adminHouseIds = houseIds.join(',');
output.invitationRedeemedBy = invitation.redeemedByUid ? invitation.redeemedByUid.stringValue : '';
