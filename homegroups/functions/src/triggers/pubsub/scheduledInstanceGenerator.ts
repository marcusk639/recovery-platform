import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import moment from "moment-timezone";
import { db } from "../../utils/firebase";
import { MeetingDocument } from "../../entities/Meeting";
import { generateInstancesForMeeting } from "../../utils/meetingUtils";

export const generateDailyMeetingInstances = functionsV1.pubsub
  .schedule("0 2 * * *") // Run daily at 2:00 AM UTC (avoids midnight edge cases)
  .timeZone("UTC")
  .onRun(async (context) => {
    functions.logger.info("Starting daily meeting instance generation...");
    const today = moment.utc().startOf("day");
    const sevenDaysFromNow = moment.utc().add(7, "days").endOf("day");

    try {
      const groupsSnapshot = await db
        .collection("groups")
        .where("subscriptionStatus", "in", ["active", "trialing"])
        .get();
      let totalInstancesCreated = 0;
      const groupPromises: Promise<void>[] = [];

      functions.logger.info(`Processing ${groupsSnapshot.size} groups.`);

      groupsSnapshot.forEach((groupDoc) => {
        const groupProcess = async () => {
          const groupId = groupDoc.id;
          const groupData = groupDoc.data();
          const groupTimezone = groupData?.timezone || "UTC";

          // Convert UTC dates to group timezone for accurate date calculations
          const groupToday = moment.tz(today, groupTimezone).startOf("day");
          const groupSevenDaysFromNow = moment
            .tz(sevenDaysFromNow, groupTimezone)
            .endOf("day");

          const meetingsSnapshot = await db
            .collection("meetings")
            .where("groupId", "==", groupId)
            .get();

          if (meetingsSnapshot.empty) return;

          for (const meetingDoc of meetingsSnapshot.docs) {
            try {
              const count = await generateInstancesForMeeting(
                meetingDoc.id,
                meetingDoc.data() as MeetingDocument,
                groupToday, // Generate starting from today in group timezone
                groupSevenDaysFromNow, // Generate up to 7 days from now
                groupTimezone,
                db,
              );
              totalInstancesCreated += count;
            } catch (meetingError) {
              functions.logger.error(
                `Error generating instances for meeting ${meetingDoc.id}:`,
                meetingError,
              );
            }
          }
        };
        groupPromises.push(groupProcess());
      });

      await Promise.all(groupPromises);
      functions.logger.info(
        `Daily meeting instance generation finished. Total instances created/checked: ${totalInstancesCreated}.`,
      );
      return null;
    } catch (error) {
      functions.logger.error(
        "Error in generateDailyMeetingInstances job:",
        error,
      );
      return null;
    }
  });
