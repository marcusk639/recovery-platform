import {Meeting, Location, MeetingSearchInput, MeetingInstance} from '../types';
import {
  FirestoreDocument,
  MeetingDocument,
  MeetingInstanceDocument,
  COLLECTION_PATHS,
} from '../types/schema';
import {firestore, auth, functions} from '../services/firebase/config';
import {generateMeetingHash} from '../utils/hashUtils';
import Firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import moment from 'moment';
import {GroupModel} from './GroupModel';

/**
 * Meeting model for managing meeting data
 */
export class MeetingModel {
  /**
   * Convert a Firestore meeting document to a Meeting object
   */
  static fromFirestore(doc: FirestoreDocument<MeetingDocument>): Meeting {
    const data = doc.data();
    return {
      id: doc.id,
      meetingId: data.meetingId,
      name: data.name,
      type: data.type as any,
      day: data.day,
      time: data.time,
      street: data.street || '',
      address: data.address || '',
      groupId: data.groupId,
      country: data.country,
      city: data.city,
      state: data.state,
      zip: data.zip,
      lat: data.lat,
      lng: data.lng,
      locationName: data.locationName,
      online: data.isOnline,
      link: data.onlineLink,
      onlineNotes: data.onlineNotes,
      verified: data.verified,
      addedBy: data.addedBy,
      format: data.format,
      temporaryNotice: data.temporaryNotice ?? null,
      isCancelledTemporarily: data.isCancelledTemporarily ?? false,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    };
  }

  /**
   * Convert a Meeting object to a Firestore document
   */
  static toFirestore(meeting: Partial<Meeting>): Partial<MeetingDocument> {
    const firestoreData: Partial<MeetingDocument> = {};

    if (meeting.name !== undefined) firestoreData.name = meeting.name;
    if (meeting.type !== undefined) firestoreData.type = meeting.type;
    if (meeting.day !== undefined) firestoreData.day = meeting.day;
    if (meeting.time !== undefined) firestoreData.time = meeting.time;
    if (meeting.street !== undefined) firestoreData.street = meeting.street;
    if (meeting.address !== undefined) firestoreData.address = meeting.address;
    if (meeting.city !== undefined) firestoreData.city = meeting.city;
    if (meeting.state !== undefined) firestoreData.state = meeting.state;
    if (meeting.zip !== undefined) firestoreData.zip = meeting.zip;
    if (meeting.lat !== undefined) firestoreData.lat = meeting.lat;
    if (meeting.lng !== undefined) firestoreData.lng = meeting.lng;
    if (meeting.locationName !== undefined)
      firestoreData.locationName = meeting.locationName;
    if (meeting.location !== undefined)
      firestoreData.location = meeting.location;
    if (meeting.online !== undefined) firestoreData.isOnline = meeting.online;
    if (meeting.link !== undefined)
      firestoreData.onlineLink = meeting.link ?? '';
    if (meeting.onlineNotes !== undefined)
      firestoreData.onlineNotes = meeting.onlineNotes ?? '';
    if (meeting.verified !== undefined)
      firestoreData.verified = meeting.verified;
    if (meeting.addedBy !== undefined) firestoreData.addedBy = meeting.addedBy;
    if (meeting.groupId !== undefined) firestoreData.groupId = meeting.groupId;
    if (meeting.format !== undefined) firestoreData.format = meeting.format;
    if (meeting.temporaryNotice !== undefined)
      firestoreData.temporaryNotice = meeting.temporaryNotice;
    if (meeting.isCancelledTemporarily !== undefined)
      firestoreData.isCancelledTemporarily = meeting.isCancelledTemporarily;

    if (meeting.createdAt) {
      try {
        firestoreData.createdAt = Firestore.Timestamp.fromDate(
          new Date(meeting.createdAt),
        );
      } catch (e) {
        if (__DEV__) console.warn('MeetingModel: failed to parse createdAt', e);
      }
    }
    if (meeting.updatedAt) {
      try {
        firestoreData.updatedAt = Firestore.Timestamp.fromDate(
          new Date(meeting.updatedAt),
        );
      } catch (e) {
        if (__DEV__) console.warn('MeetingModel: failed to parse updatedAt', e);
      }
    }

    return firestoreData;
  }

  /**
   * Get a meeting by ID
   */
  static async getById(meetingId: string): Promise<Meeting | null> {
    try {
      const doc = await firestore.collection('meetings').doc(meetingId).get();

      if (!doc.exists) {
        return null;
      }

      return MeetingModel.fromFirestore({
        id: doc.id,
        data: () => doc.data() as MeetingDocument,
      });
    } catch (error) {
      console.error('Error getting meeting:', error);
      throw error;
    }
  }

  /**
   * Create a batch of meetings
   */
  static async createBatch(
    meetingData: Partial<Meeting>[],
  ): Promise<Meeting[]> {
    const batch = firestore.batch();
    const meetings: Meeting[] = [];

    for (const meeting of meetingData) {
      const id = generateMeetingHash(meeting as Meeting);
      batch.set(
        firestore.collection('meetings').doc(id),
        MeetingModel.toFirestore(meeting),
      );
      meetings.push({
        ...meeting,
        id,
      } as Meeting);
    }

    await batch.commit();

    return meetings;
  }

  /**
   * Create a new meeting
   */
  static async create(meetingData: Partial<Meeting>): Promise<Meeting> {
    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error('No authenticated user');
      }

      const now = new Date();

      const newMeeting = {
        ...meetingData,
        id: generateMeetingHash(meetingData as Meeting),
        verified: false, // New meetings start unverified
        addedBy: currentUser.uid,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await firestore
        .collection('meetings')
        .add(MeetingModel.toFirestore(newMeeting));

      const createdMeeting = await docRef.get();
      return {
        ...MeetingModel.fromFirestore({
          id: createdMeeting.id,
          data: () => createdMeeting.data() as MeetingDocument,
        }),
        id: docRef.id,
      };
    } catch (error) {
      console.error('Error creating meeting:', error);
      throw error;
    }
  }

  /**
   * Update a meeting (ensure updatedAt is always set)
   */
  static async update(
    meetingId: string,
    meetingData: Partial<Meeting>,
  ): Promise<Meeting> {
    try {
      const meetingRef = firestore.collection('meetings').doc(meetingId);
      const meetingDoc = await meetingRef.get();

      if (!meetingDoc.exists) {
        throw new Error('Meeting not found');
      }

      // Convert the meeting data to Firestore format
      const firestoreData = MeetingModel.toFirestore(meetingData);

      // Ensure updatedAt is always set
      const updatePayload = {
        ...firestoreData,
        updatedAt: Firestore.Timestamp.now(),
      };

      // Log the update payload for debugging
      console.log('Updating meeting with payload:', updatePayload);

      // Update the document
      await meetingRef.update(updatePayload);

      // Fetch and return the updated document
      const updatedDoc = await meetingRef.get();
      return MeetingModel.fromFirestore({
        id: updatedDoc.id,
        data: () => updatedDoc.data() as MeetingDocument,
      });
    } catch (error) {
      console.error('Error updating meeting:', error);
      throw error;
    }
  }

  /**
   * Search for meetings using the cloud function
   */
  static async findMeetings(
    searchInput: MeetingSearchInput,
  ): Promise<Meeting[]> {
    try {
      const result = await functions.httpsCallable('findMeetings')(searchInput);

      if (!result.data || !Array.isArray(result.data)) {
        throw new Error('Invalid response from findMeetings function');
      }

      // Convert to Meeting objects
      const meetings = result.data.map((meeting: any) => ({
        id: meeting.id,
        name: meeting.name,
        type: meeting.type,
        day: meeting.day,
        time: meeting.time,
        street: meeting.address || '',
        city: meeting.city,
        state: meeting.state,
        zip: meeting.zip,
        lat: meeting.lat,
        lng: meeting.lng,
        locationName: meeting.location,
        types: meeting.types,
        online: meeting.isOnline,
        link: meeting.onlineLink,
        onlineNotes: meeting.onlineNotes,
        verified: meeting.verified,
        addedBy: meeting.addedBy,

        // Add extra fields for UI
        isFavorite: false, // Will be updated later
      }));

      // Check if meetings are in user's favorites
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDoc = await firestore
          .collection('users')
          .doc(currentUser.uid)
          .get();
        const userData = userDoc.data();
        const favorites = userData?.favoriteMeetings || [];

        // Mark favorite meetings
        meetings.forEach(meeting => {
          if (meeting.id && favorites.includes(meeting.id)) {
            meeting.isFavorite = true;
          }
        });
      }

      return meetings;
    } catch (error) {
      console.error('Error finding meetings:', error);
      throw error;
    }
  }

  /**
   * Check if a meeting is a favorite
   */
  static async isFavorite(meetingId: string): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        return false;
      }

      const userDoc = await firestore
        .collection('users')
        .doc(currentUser.uid)
        .get();
      const userData = userDoc.data();
      const favorites = userData?.favoriteMeetings || [];

      return favorites.includes(meetingId);
    } catch (error) {
      console.error('Error checking if meeting is favorite:', error);
      return false;
    }
  }

  static async getMeetingsByGroupId(groupId: string): Promise<Meeting[]> {
    const meetings = await firestore
      .collection('meetings')
      .where('groupId', '==', groupId)
      .get();

    return meetings.docs.map(doc =>
      MeetingModel.fromFirestore({
        id: doc.id,
        data: () => doc.data() as MeetingDocument,
      }),
    );
  }

  /**
   * Get upcoming meeting instances for a group within the next week.
   */
  static async getUpcomingInstancesByGroupId(
    groupId: string,
    limit: number = 50,
  ): Promise<MeetingInstance[]> {
    try {
      const now = Firestore.Timestamp.now();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      const endTimestamp = Firestore.Timestamp.fromDate(endDate);

      const instancesSnapshot = await firestore
        .collection(COLLECTION_PATHS.MEETING_INSTANCES)
        .where('groupId', '==', groupId)
        .where('scheduledAt', '>=', now)
        .where('scheduledAt', '<=', endTimestamp)
        .orderBy('scheduledAt', 'asc')
        .limit(limit)
        .get();

      const instances = instancesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          instanceId: doc.id,
          meetingId: data.meetingId,
          groupId: data.groupId,
          scheduledAt: (
            data.scheduledAt as FirebaseFirestoreTypes.Timestamp
          ).toDate(),
          name: data.name,
          type: data.type,
          format: data.format === null ? undefined : data.format,
          location: data.location,
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
          lat: data.lat,
          lng: data.lng,
          locationName: data.locationName,
          isOnline: data.isOnline,
          link: data.link ?? null,
          onlineNotes: data.onlineNotes ?? null,
          isCancelled: data.isCancelled ?? false,
          instanceNotice: data.instanceNotice ?? null,
          templateUpdatedAt: (
            data.templateUpdatedAt as FirebaseFirestoreTypes.Timestamp
          ).toDate(),
          day: moment(
            (data.scheduledAt as FirebaseFirestoreTypes.Timestamp).toDate(),
          )
            .format('dddd')
            .toLowerCase(),
          time: moment(
            (data.scheduledAt as FirebaseFirestoreTypes.Timestamp).toDate(),
          ).format('HH:mm'),
          verified: data.verified ?? false,
          country: data.country ?? null,
          street: data.street ?? null,
          addedBy: data.addedBy ?? null,
        } as MeetingInstance;
      });

      return instances;
    } catch (error) {
      console.error('Error fetching meeting instances from model:', error);
      throw error;
    }
  }

  /**
   * Update the chairperson for a specific meeting instance.
   * Requires admin privileges.
   */
  static async updateInstanceChairperson(
    instanceId: string,
    chairpersonId: string | null,
    chairpersonName: string | null,
  ): Promise<void> {
    try {
      const instanceRef = Firestore()
        .collection(COLLECTION_PATHS.MEETING_INSTANCES)
        .doc(instanceId);

      const instanceDoc = await instanceRef.get();
      if (!instanceDoc.exists) {
        throw new Error('Meeting instance not found.');
      }
      const instanceData = instanceDoc.data() as MeetingInstanceDocument;
      const groupId = instanceData.groupId;

      const currentUser = auth.currentUser;
      if (
        !currentUser ||
        !(await GroupModel.isGroupAdmin(groupId, currentUser.uid))
      ) {
        throw new Error(
          'Permission denied: Only group admins can assign chairpersons.',
        );
      }

      await instanceRef.update({
        chairpersonId: chairpersonId,
        chairpersonName: chairpersonName,
      });
      console.log(
        `Updated chairperson for instance ${instanceId} to ${
          chairpersonName || 'none'
        }`,
      );
    } catch (error) {
      console.error(
        `Error updating chairperson for instance ${instanceId}:`,
        error,
      );
      throw new Error('Failed to update meeting chairperson.');
    }
  }

  /**
   * Update a meeting instance with override tracking.
   * Requires admin privileges.
   * Tracks which fields are overridden to preserve customizations when template updates.
   */
  static async updateInstance(
    instanceId: string,
    updates: {
      scheduledAt?: Date;
      location?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      lat?: number;
      lng?: number;
      locationName?: string;
      isOnline?: boolean;
      link?: string | null;
      onlineNotes?: string | null;
      isCancelled?: boolean;
      instanceNotice?: string | null;
      isPublic?: boolean;
    },
  ): Promise<void> {
    try {
      const instanceRef = Firestore()
        .collection(COLLECTION_PATHS.MEETING_INSTANCES)
        .doc(instanceId);

      const instanceDoc = await instanceRef.get();
      if (!instanceDoc.exists) {
        throw new Error('Meeting instance not found.');
      }

      const instanceData = instanceDoc.data() as MeetingInstanceDocument;
      const groupId = instanceData.groupId;

      // Check admin permissions
      const currentUser = auth.currentUser;
      if (
        !currentUser ||
        !(await GroupModel.isGroupAdmin(groupId, currentUser.uid))
      ) {
        throw new Error(
          'Permission denied: Only group admins can modify meeting instances.',
        );
      }

      // Get existing overridden fields
      const existingOverrides = instanceData.overriddenFields || {};

      // Build update payload and track overrides
      const updatePayload: Partial<MeetingInstanceDocument> = {};
      const newOverrides: typeof existingOverrides = {...existingOverrides};

      // Handle scheduledAt (date/time) changes
      if (updates.scheduledAt !== undefined) {
        updatePayload.scheduledAt = Firestore.Timestamp.fromDate(
          updates.scheduledAt,
        );
        newOverrides.scheduledAt = true;
      }

      // Handle location fields
      if (updates.location !== undefined) {
        updatePayload.location = updates.location ?? null;
        newOverrides.location = true;
      }
      if (updates.address !== undefined) {
        updatePayload.address = updates.address ?? null;
        newOverrides.address = true;
      }
      if (updates.city !== undefined) {
        updatePayload.city = updates.city ?? null;
        newOverrides.city = true;
      }
      if (updates.state !== undefined) {
        updatePayload.state = updates.state ?? null;
        newOverrides.state = true;
      }
      if (updates.zip !== undefined) {
        updatePayload.zip = updates.zip ?? null;
        newOverrides.zip = true;
      }
      if (updates.lat !== undefined) {
        updatePayload.lat = updates.lat ?? null;
        newOverrides.lat = true;
      }
      if (updates.lng !== undefined) {
        updatePayload.lng = updates.lng ?? null;
        newOverrides.lng = true;
      }
      if (updates.locationName !== undefined) {
        updatePayload.locationName = updates.locationName ?? null;
        newOverrides.locationName = true;
      }

      // Handle online fields
      if (updates.isOnline !== undefined) {
        updatePayload.isOnline = updates.isOnline;
        newOverrides.isOnline = true;
      }
      if (updates.link !== undefined) {
        updatePayload.link = updates.link ?? null;
        newOverrides.link = true;
      }
      if (updates.onlineNotes !== undefined) {
        updatePayload.onlineNotes = updates.onlineNotes ?? null;
        newOverrides.onlineNotes = true;
      }

      // Handle instance-specific fields (not subject to overrides)
      if (updates.isCancelled !== undefined) {
        updatePayload.isCancelled = updates.isCancelled;
      }
      if (updates.instanceNotice !== undefined) {
        updatePayload.instanceNotice = updates.instanceNotice ?? null;
      }
      if (updates.isPublic !== undefined) {
        updatePayload.isPublic = updates.isPublic;
      }

      // Update override tracking and modification timestamp
      updatePayload.overriddenFields = newOverrides;
      updatePayload.instanceModifiedAt = Firestore.Timestamp.now();

      await instanceRef.update(updatePayload);
      console.log(
        `Updated instance ${instanceId} with overrides:`,
        newOverrides,
      );
    } catch (error) {
      console.error(`Error updating instance ${instanceId}:`, error);
      throw error;
    }
  }
}
