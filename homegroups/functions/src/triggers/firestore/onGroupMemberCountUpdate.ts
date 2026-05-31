import * as functions from "firebase-functions/v1";

// Note: This trigger is kept for potential future use, but subscription updates
// are no longer needed since we use flat-rate pricing ($12/year).
// Member count changes do not affect subscription cost.

export const onGroupMemberCountUpdate = functions.firestore
  .document("groups/{groupId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const groupId = context.params.groupId;

    const beforeMemberCount = beforeData.memberCount || 0;
    const afterMemberCount = afterData.memberCount || 0;

    // Only proceed if member count actually changed
    if (beforeMemberCount === afterMemberCount) {
      return;
    }

    // Log member count change (subscription uses flat rate, so no update needed)
    console.log(
      `Member count changed for group ${groupId}: ${beforeMemberCount} -> ${afterMemberCount} (subscription cost unchanged - flat rate pricing)`
    );
  });
