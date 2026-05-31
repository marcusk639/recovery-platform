import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import { db } from "../../utils/firebase";
import { generateMeetingHash } from "../../utils/meetings";
import {
  formatMeetingForFirestore,
  findRelevantMeetings,
} from "../../utils/meetingUtils";
import { Meeting } from "../../entities/Meeting";

// Triggered when a new group document is created
export const onGroupCreateSetGeolocation = functionsV1.firestore
  .document("groups/{groupId}")
  .onCreate(async (snapshot, context) => {
    const groupId = context.params.groupId;
    const groupData = snapshot.data();

    if (!groupData?.lat || !groupData?.lng) {
      console.log(
        `Group ${groupId} created without coordinates. Skipping geohash.`
      );
      return null;
    }

    try {
      const lat = Number(groupData.lat);
      const lng = Number(groupData.lng);
      const geohash = geofire.geohashForLocation([lat, lng]);

      console.log(`Generated geohash ${geohash} for new group ${groupId}`);

      await snapshot.ref.update({
        geohash: geohash,
        lat: lat, // Ensure numeric
        lng: lng, // Ensure numeric
      });
      return { success: true, geohash };
    } catch (error) {
      console.error(`Error setting geohash for group ${groupId}:`, error);
      return null; // Don't block other potential triggers
    }
  });

// Triggered when a new group document is created
export const onGroupCreateFetchMeetings = functionsV1.firestore
  .document("groups/{groupId}")
  .onCreate(async (snapshot, context) => {
    const groupId = context.params.groupId;
    const groupData = snapshot.data();

    console.log(
      `New group created: ${groupId}. Checking for nearby meetings...`
    );

    if (!groupData?.lat || !groupData?.lng) {
      console.warn(
        `Group ${groupId} does not have location data, skipping meeting fetch.`
      );
      return null;
    }
    // Only fetch for AA groups initially, expand later if needed
    if (groupData.type !== "AA") {
      console.log(`Group ${groupId} is not type AA, skipping meeting fetch.`);
      return null;
    }

    try {
      const { getAAMeetings } = require("../api/api"); // Relative path to api
      const latitude = Number(groupData.lat);
      const longitude = Number(groupData.lng);
      const meetingsResponse = await getAAMeetings(latitude, longitude);

      console.log(
        `Fetched ${
          meetingsResponse.meetings?.length || 0
        } meetings from Meeting Guide API near group ${groupId}`
      );

      const relevantMeetings = findRelevantMeetings(
        meetingsResponse.meetings || [],
        groupData
      );
      console.log(
        `Found ${relevantMeetings.length} meetings relevant to group ${groupId}`
      );

      if (relevantMeetings.length === 0) {
        return null;
      }

      const batch = db.batch();
      let meetingsCreated = 0;
      const meetingsCollection = db.collection("meetings");

      for (const meeting of relevantMeetings) {
        const formattedMeeting = formatMeetingForFirestore(meeting);
        // Use a consistent hashing function if available, otherwise use API ID or generate one
        const meetingId = generateMeetingHash(formattedMeeting as Meeting);

        if (meetingId !== meeting.id) {
          throw new Error(
            `Meeting ID mismatch for ${meeting.name}. Expected ${meeting.id}, got ${meetingId}`
          );
        }

        const meetingDocRef = meetingsCollection.doc(meetingId);

        // Check if meeting already exists (basic check)
        // A more robust check might query based on key properties
        const existingDoc = await meetingDocRef.get();
        if (!existingDoc.exists) {
          batch.set(meetingDocRef, {
            ...formattedMeeting,
            groupId: groupId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            addedBy: "system", // Indicate source
            verified: true, // Assume verified from source initially
          });
          meetingsCreated++;
        }
      }

      if (meetingsCreated > 0) {
        await batch.commit();
        console.log(
          `Created ${meetingsCreated} meeting documents for group ${groupId}`
        );
        await snapshot.ref.update({
          meetingCount: admin.firestore.FieldValue.increment(meetingsCreated),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        console.log(
          `No new relevant meetings found to add for group ${groupId}`
        );
      }

      return { success: true, meetingsCreated };
    } catch (error) {
      console.error(
        `Error in onGroupCreateFetchMeetings for group ${groupId}:`,
        error
      );
      return null;
    }
  });
