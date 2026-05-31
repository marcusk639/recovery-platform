import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { db } from "../../utils/firebase";
import { rebuildUserClaims } from "./onMemberWrite";

interface GroupData {
  treasurers?: string[];
  admins?: string[];
}

/**
 * Cloud Function triggered when a group document is updated
 * Specifically watches for changes to the treasurers array and syncs claims accordingly
 */
export const onGroupTreasurerUpdate = functionsV1.firestore
  .document("groups/{groupId}")
  .onUpdate(async (change, context) => {
    const { groupId } = context.params;
    const beforeData = change.before.data() as GroupData;
    const afterData = change.after.data() as GroupData;

    const beforeTreasurers = beforeData.treasurers || [];
    const afterTreasurers = afterData.treasurers || [];

    // Check if treasurers array changed
    const treasurersChanged =
      JSON.stringify(beforeTreasurers.sort()) !==
      JSON.stringify(afterTreasurers.sort());

    if (!treasurersChanged) {
      functions.logger.debug(
        `No treasurer changes detected for group ${groupId}. Skipping.`
      );
      return null;
    }

    functions.logger.info(
      `Treasurer list changed for group ${groupId}. Before: ${beforeTreasurers.length}, After: ${afterTreasurers.length}`
    );

    // Find users who were added or removed as treasurers
    const addedTreasurers = afterTreasurers.filter(
      (id) => !beforeTreasurers.includes(id)
    );
    const removedTreasurers = beforeTreasurers.filter(
      (id) => !afterTreasurers.includes(id)
    );

    const affectedUsers = [...new Set([...addedTreasurers, ...removedTreasurers])];

    if (affectedUsers.length === 0) {
      functions.logger.info("No users affected by treasurer changes");
      return null;
    }

    functions.logger.info(
      `Updating claims for ${affectedUsers.length} affected users`
    );

    // Update member documents and rebuild claims for affected users
    const updatePromises: Promise<void>[] = [];

    for (const userId of affectedUsers) {
      const isTreasurer = afterTreasurers.includes(userId);
      const memberDocId = `${groupId}_${userId}`;
      const memberRef = db.collection("members").doc(memberDocId);

      // Update the member document's isTreasurer field
      updatePromises.push(
        (async () => {
          try {
            const memberDoc = await memberRef.get();
            if (memberDoc.exists) {
              const updateData: Record<string, unknown> = {
                isTreasurer: isTreasurer,
              };

              // Update roles array as well
              if (isTreasurer) {
                updateData.roles = 
                  require("firebase-admin").firestore.FieldValue.arrayUnion("treasurer");
              } else {
                updateData.roles = 
                  require("firebase-admin").firestore.FieldValue.arrayRemove("treasurer");
              }

              await memberRef.update(updateData);
              functions.logger.info(
                `Updated isTreasurer=${isTreasurer} for member ${memberDocId}`
              );
            } else {
              functions.logger.warn(
                `Member document ${memberDocId} not found. User may not be a member.`
              );
            }

            // Rebuild claims for this user
            await rebuildUserClaims(userId);
          } catch (error) {
            functions.logger.error(
              `Error updating treasurer status for user ${userId}:`,
              error
            );
          }
        })()
      );
    }

    await Promise.all(updatePromises);

    functions.logger.info(
      `Completed treasurer claim sync for group ${groupId}`
    );

    return null;
  });

