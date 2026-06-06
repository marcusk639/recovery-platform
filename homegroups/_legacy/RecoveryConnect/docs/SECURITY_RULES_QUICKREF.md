> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Security Rules Quick Reference

## Deployment Checklist

```
□ 1. Backup rules:        cp firestore.rules firestore.rules.backup
□ 2. Build functions:     cd functions && npm run build
□ 3. Deploy functions:    firebase deploy --only functions
□ 4. Dry-run migration:   cd scripts && npx ts-node migrateClaimsAndRoles.ts --dry-run
□ 5. Run migration:       npx ts-node migrateClaimsAndRoles.ts
□ 6. Verify claims:       Check Firebase Console → Authentication → Users
□ 7. Deploy rules:        firebase deploy --only firestore:rules
□ 8. Test critical flows: Join group, create announcement, treasury access
```

## Emergency Rollback

```bash
cp firestore.rules.backup firestore.rules
firebase deploy --only firestore:rules
```

## Check Claims

```typescript
// In mobile app
import { getUserClaims } from "../services/firebase/auth";
const claims = await getUserClaims();
console.log(claims);
```

## Force Token Refresh

```typescript
import { refreshAuthToken, syncUserClaims } from "../services/firebase/auth";

// Option 1: Just refresh token
await refreshAuthToken();

// Option 2: Sync claims then refresh
await syncUserClaims();
```

## View Cloud Function Logs

```bash
firebase functions:log --only onMemberWrite
firebase functions:log --only onGroupTreasurerUpdate
firebase functions:log --only syncUserClaims
```

## Common Permission Errors

| Error                          | Likely Cause                | Solution                     |
| ------------------------------ | --------------------------- | ---------------------------- |
| User can't read announcements  | Not in memberGroups claim   | `await syncUserClaims()`     |
| Admin can't update group       | Not in adminGroups claim    | `await syncUserClaims()`     |
| Treasurer can't add expense    | Not in treasurerGroups      | Check isTreasurer in member doc |
| Claims not updating            | Function didn't trigger     | Check function logs          |

## Custom Claims Structure

```json
{
  "superAdmin": true,
  "memberGroups": ["groupId1", "groupId2"],
  "adminGroups": ["groupId1"],
  "treasurerGroups": ["groupId1"]
}
```

## Files to Know

| File                                                          | Purpose                |
| ------------------------------------------------------------- | ---------------------- |
| `firestore.rules`                                             | Security rules         |
| `firestore.rules.backup`                                      | Rollback (open rules)  |
| `functions/src/triggers/firestore/onMemberWrite.ts`           | Claims sync trigger    |
| `functions/src/triggers/firestore/onGroupTreasurerUpdate.ts`  | Treasurer sync trigger |
| `functions/src/callable/syncUserClaims.ts`                    | Manual sync function   |
| `mobile/src/services/firebase/auth.ts`                        | Token refresh utils    |
| `scripts/migrateClaimsAndRoles.ts`                            | Migration script       |

## Testing

```bash
# Start emulators
firebase emulators:start

# Run tests (in another terminal)
cd functions && npm test
```

## Access Control Summary

| Collection      | Read            | Write              |
| --------------- | --------------- | ------------------ |
| users           | Owner           | Owner              |
| groups          | Public          | Admin              |
| members         | Member          | Self/Admin         |
| meetings        | Public          | Admin              |
| announcements   | Member          | Admin              |
| transactions    | Member          | Treasurer/Admin    |
| DM threads      | Participant     | Participant        |
| group_chats     | Member          | Member             |
| reports         | Admin           | Member (create)    |
| user_bans       | Admin           | Admin              |
| sponsorships    | Participant     | Participant        |
