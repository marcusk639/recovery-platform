import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import moment from "moment-timezone";
import { db } from "../../utils/firebase";
import { MeetingDocument } from "../../entities/Meeting";
import { generateInstancesForMeeting } from "../../utils/meetingUtils";

/**
 * Triggered when a new meeting document is created.
 * Generates meeting instances immediately for the next 7 days.
 */
export const onMeetingCreate = functionsV1.firestore
  .document("meetings/{meetingId}")
  .onCreate(async (snapshot, context) => {
    const meetingId = context.params.meetingId;
    const meetingData = snapshot.data() as MeetingDocument;

    functions.logger.info(
      `New meeting created: ${meetingId} for group ${meetingData.groupId}`
    );

    try {
      // Get group timezone
      const groupDoc = await db
        .collection("groups")
        .doc(meetingData.groupId)
        .get();

      if (!groupDoc.exists) {
        functions.logger.warn(
          `Group ${meetingData.groupId} not found for meeting ${meetingId}`
        );
        return null;
      }

      const groupData = groupDoc.data();
      const groupTimezone = groupData?.timezone || "UTC";

      // Calculate 7-day window in group timezone
      const today = moment.tz(groupTimezone).startOf("day");
      const sevenDaysFromNow = moment
        .tz(groupTimezone)
        .add(7, "days")
        .endOf("day");

      // Generate instances for the next 7 days
      const count = await generateInstancesForMeeting(
        meetingId,
        meetingData,
        today,
        sevenDaysFromNow,
        groupTimezone,
        db
      );

      functions.logger.info(
        `Generated ${count} instances for new meeting ${meetingId}`
      );

      return { success: true, instancesCreated: count };
    } catch (error) {
      // Log error but don't fail meeting creation
      functions.logger.error(
        `Error generating instances for new meeting ${meetingId}:`,
        error
      );
      return null;
    }
  });
