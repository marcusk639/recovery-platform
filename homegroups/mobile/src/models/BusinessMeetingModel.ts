import {BusinessMeeting, AgendaItem} from '../types/domain/business-meeting';
import {
  BusinessMeetingDocument,
  AgendaItemDocument,
  COLLECTION_PATHS,
} from '../types/schema';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {GroupModel} from './GroupModel';

/**
 * Model for handling Business Meeting data
 */
export class BusinessMeetingModel {
  /**
   * Convert Firestore Document to BusinessMeeting app type
   */
  static fromFirestore(
    snapshot: FirebaseFirestoreTypes.DocumentSnapshot,
  ): BusinessMeeting {
    const data = snapshot.data() as BusinessMeetingDocument | undefined;
    if (!data) {
      throw new Error(`Business meeting data missing for doc ${snapshot.id}`);
    }
    return {
      id: snapshot.id,
      groupId: data.groupId,
      date: data.date.toDate(),
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      isOnline: data.isOnline ?? false,
      onlineLink: data.onlineLink,
      chair: data.chair,
      secretary: data.secretary,
      attendees: data.attendees || [],
      agenda: [], // Agenda items are loaded separately from subcollection
      minutes: (data as any).minutes,
      decisions: [], // Not implementing formal decisions in standard scope
      nextMeetingDate: (data as any).nextMeetingDate?.toDate(),
      status: data.status,
      createdBy: data.createdBy,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  }

  /**
   * Convert AgendaItem Firestore Document to app type
   */
  static agendaItemFromFirestore(
    snapshot: FirebaseFirestoreTypes.DocumentSnapshot,
  ): AgendaItem {
    const data = snapshot.data() as AgendaItemDocument | undefined;
    if (!data) {
      throw new Error(`Agenda item data missing for doc ${snapshot.id}`);
    }
    return {
      id: snapshot.id,
      title: data.title,
      description: data.description,
      presenter: data.presenter,
      type: data.type,
      timeAllotted: data.timeAllotted,
      order: data.order,
      status: data.status,
      notes: data.notes,
    };
  }

  /**
   * Convert BusinessMeeting object to Firestore document
   */
  static toFirestore(
    meeting: Partial<BusinessMeeting>,
  ): Partial<BusinessMeetingDocument> {
    const {id, agenda, decisions, ...rest} = meeting as any;
    const doc: any = {...rest};

    // Convert Date to Timestamp
    if (rest.date) {
      doc.date = firestore.Timestamp.fromDate(rest.date);
    }
    if (rest.nextMeetingDate) {
      doc.nextMeetingDate = firestore.Timestamp.fromDate(rest.nextMeetingDate);
    }

    return doc;
  }

  /**
   * Get all business meetings for a group
   */
  static async getByGroup(groupId: string): Promise<BusinessMeeting[]> {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .where('groupId', '==', groupId)
        .orderBy('date', 'desc')
        .get();

      if (snapshot.empty) {
        return [];
      }

      const meetings = await Promise.all(
        snapshot.docs.map(async doc => {
          const meeting = this.fromFirestore(doc);
          // Load agenda items for each meeting
          meeting.agenda = await this.getAgendaItems(meeting.id);
          return meeting;
        }),
      );

      return meetings;
    } catch (error) {
      console.error('Error getting business meetings for group', error);
      throw error;
    }
  }

  /**
   * Get a single business meeting by ID
   */
  static async getById(meetingId: string): Promise<BusinessMeeting | null> {
    try {
      const doc = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const meeting = this.fromFirestore(doc);
      meeting.agenda = await this.getAgendaItems(meetingId);
      return meeting;
    } catch (error) {
      console.error('Error getting business meeting by ID', error);
      throw error;
    }
  }

  /**
   * Get agenda items for a meeting
   */
  static async getAgendaItems(meetingId: string): Promise<AgendaItem[]> {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
        .orderBy('order', 'asc')
        .get();

      if (snapshot.empty) {
        return [];
      }

      return snapshot.docs.map(doc => this.agendaItemFromFirestore(doc));
    } catch (error) {
      console.error('Error getting agenda items', error);
      throw error;
    }
  }

  /**
   * Create a new business meeting
   */
  static async create(
    groupId: string,
    data: {
      date: Date;
      startTime: string;
      endTime?: string;
      location: string;
      isOnline: boolean;
      onlineLink?: string;
      chair: string;
      secretary: string;
      treasuryReportId?: string;
    },
  ): Promise<BusinessMeeting> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    // Permission check: Ensure user is an admin of the group
    const isAdmin = await GroupModel.isGroupAdmin(groupId, currentUser.uid);
    if (!isAdmin) {
      throw new Error(
        'User does not have permission to create business meetings.',
      );
    }

    const now = firestore.Timestamp.now();
    const docRef = firestore()
      .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
      .doc();

    const meetingData: BusinessMeetingDocument = {
      id: docRef.id,
      groupId,
      date: firestore.Timestamp.fromDate(data.date),
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      isOnline: data.isOnline,
      onlineLink: data.onlineLink,
      chair: data.chair,
      secretary: data.secretary,
      attendees: [],
      treasuryReportId: data.treasuryReportId,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.uid,
    };

    try {
      await docRef.set(meetingData);
      const createdDoc = await docRef.get();
      return this.fromFirestore(createdDoc);
    } catch (error) {
      console.error('Error creating business meeting:', error);
      throw new Error('Failed to create business meeting.');
    }
  }

  /**
   * Update an existing business meeting
   */
  static async update(
    meetingId: string,
    updateData: Partial<BusinessMeeting>,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      const docRef = firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId);

      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Business meeting not found');
      }

      const currentData = doc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        currentData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error(
          'User does not have permission to update this meeting.',
        );
      }

      const now = firestore.Timestamp.now();
      const data: any = {
        ...this.toFirestore(updateData),
        updatedAt: now,
      };

      await docRef.update(data);
    } catch (error) {
      console.error('Error updating business meeting', error);
      throw error;
    }
  }

  /**
   * Delete a business meeting
   */
  static async delete(meetingId: string): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      const docRef = firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId);

      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Business meeting not found');
      }

      const currentData = doc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        currentData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error(
          'User does not have permission to delete this meeting.',
        );
      }

      // Delete all agenda items first
      const agendaSnapshot = await firestore()
        .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
        .get();

      const batch = firestore().batch();
      agendaSnapshot.docs.forEach(agendaDoc => {
        batch.delete(agendaDoc.ref);
      });
      batch.delete(docRef);

      await batch.commit();
    } catch (error) {
      console.error('Error deleting business meeting', error);
      throw error;
    }
  }

  /**
   * Update the status of a business meeting
   */
  static async updateStatus(
    meetingId: string,
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
  ): Promise<void> {
    await this.update(meetingId, {status} as Partial<BusinessMeeting>);
  }

  /**
   * Update attendees list
   */
  static async updateAttendees(
    meetingId: string,
    attendeeIds: string[],
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      const docRef = firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId);

      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Business meeting not found');
      }

      const currentData = doc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        currentData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error('User does not have permission to update attendees.');
      }

      await docRef.update({
        attendees: attendeeIds,
        updatedAt: firestore.Timestamp.now(),
      });
    } catch (error) {
      console.error('Error updating attendees', error);
      throw error;
    }
  }

  /**
   * Update meeting minutes
   */
  static async updateMinutes(
    meetingId: string,
    minutes: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      const docRef = firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId);

      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Business meeting not found');
      }

      const currentData = doc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        currentData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error('User does not have permission to update minutes.');
      }

      await docRef.update({
        minutes,
        updatedAt: firestore.Timestamp.now(),
      });
    } catch (error) {
      console.error('Error updating minutes', error);
      throw error;
    }
  }

  /**
   * Add an agenda item
   */
  static async addAgendaItem(
    meetingId: string,
    item: Omit<AgendaItem, 'id'>,
  ): Promise<AgendaItem> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      // Get meeting to check permissions
      const meetingDoc = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new Error('Business meeting not found');
      }

      const meetingData = meetingDoc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        meetingData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error('User does not have permission to add agenda items.');
      }

      const docRef = firestore()
        .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
        .doc();

      const agendaData: AgendaItemDocument = {
        id: docRef.id,
        title: item.title,
        description: item.description,
        presenter: item.presenter,
        type: item.type,
        timeAllotted: item.timeAllotted,
        order: item.order,
        status: item.status || 'pending',
        notes: item.notes,
      };

      await docRef.set(agendaData);

      // Update meeting's updatedAt
      await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .update({updatedAt: firestore.Timestamp.now()});

      return {
        ...item,
        id: docRef.id,
        status: item.status || 'pending',
      };
    } catch (error) {
      console.error('Error adding agenda item', error);
      throw error;
    }
  }

  /**
   * Update an agenda item
   */
  static async updateAgendaItem(
    meetingId: string,
    itemId: string,
    updateData: Partial<AgendaItem>,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      // Get meeting to check permissions
      const meetingDoc = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new Error('Business meeting not found');
      }

      const meetingData = meetingDoc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        meetingData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error(
          'User does not have permission to update agenda items.',
        );
      }

      const {id, ...data} = updateData;

      await firestore()
        .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
        .doc(itemId)
        .update(data);

      // Update meeting's updatedAt
      await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .update({updatedAt: firestore.Timestamp.now()});
    } catch (error) {
      console.error('Error updating agenda item', error);
      throw error;
    }
  }

  /**
   * Remove an agenda item
   */
  static async removeAgendaItem(
    meetingId: string,
    itemId: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      // Get meeting to check permissions
      const meetingDoc = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new Error('Business meeting not found');
      }

      const meetingData = meetingDoc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        meetingData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error(
          'User does not have permission to remove agenda items.',
        );
      }

      await firestore()
        .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
        .doc(itemId)
        .delete();

      // Update meeting's updatedAt
      await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .update({updatedAt: firestore.Timestamp.now()});
    } catch (error) {
      console.error('Error removing agenda item', error);
      throw error;
    }
  }

  /**
   * Reorder agenda items
   */
  static async reorderAgendaItems(
    meetingId: string,
    itemOrders: {id: string; order: number}[],
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('Authentication required.');
    }

    try {
      // Get meeting to check permissions
      const meetingDoc = await firestore()
        .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new Error('Business meeting not found');
      }

      const meetingData = meetingDoc.data() as BusinessMeetingDocument;

      // Permission check
      const isAdmin = await GroupModel.isGroupAdmin(
        meetingData.groupId,
        currentUser.uid,
      );
      if (!isAdmin) {
        throw new Error(
          'User does not have permission to reorder agenda items.',
        );
      }

      const batch = firestore().batch();

      for (const item of itemOrders) {
        const itemRef = firestore()
          .collection(COLLECTION_PATHS.AGENDA_ITEMS(meetingId))
          .doc(item.id);
        batch.update(itemRef, {order: item.order});
      }

      // Update meeting's updatedAt
      batch.update(
        firestore()
          .collection(COLLECTION_PATHS.BUSINESS_MEETINGS)
          .doc(meetingId),
        {updatedAt: firestore.Timestamp.now()},
      );

      await batch.commit();
    } catch (error) {
      console.error('Error reordering agenda items', error);
      throw error;
    }
  }
}
