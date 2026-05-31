import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {ServicePosition} from '../types';
import {ServicePositionDocument, COLLECTION_PATHS} from '../types/schema';
import {GroupModel} from './GroupModel'; // For permission checks

export class ServicePositionModel {
  /**
   * Convert Firestore doc to ServicePosition app type
   */
  static fromFirestore(
    doc: FirebaseFirestoreTypes.DocumentSnapshot,
  ): ServicePosition {
    const data = doc.data() as ServicePositionDocument | undefined;
    if (!data)
      throw new Error(`Service position data missing for doc ${doc.id}`);
    return {
      id: doc.id,
      groupId: data.groupId,
      name: data.name,
      description: data.description,
      commitmentLength: data.commitmentLength ?? undefined,
      currentHolderId: data.currentHolderId ?? null,
      currentHolderName: data.currentHolderName ?? null,
      termStartDate: data.termStartDate?.toDate() ?? null,
      termEndDate: data.termEndDate?.toDate() ?? null,
      remindersSent: data.remindersSent,
      createdAt: data.createdAt.toDate(), // Should always exist
      updatedAt: data.updatedAt.toDate(), // Should always exist
    };
  }

  /**
   * Get all service positions for a group
   */
  static async getPositionsForGroup(
    groupId: string,
  ): Promise<ServicePosition[]> {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.SERVICE_POSITIONS(groupId))
        .orderBy('name', 'asc') // Order alphabetically by name
        .get();

      if (!snapshot) {
        console.warn(`No snapshot returned for group ${groupId}`);
        return [];
      }

      return snapshot.docs.map(doc => this.fromFirestore(doc));
    } catch (error) {
      console.error(
        `Error getting service positions for group ${groupId}:`,
        error,
      );
      // Return empty array instead of throwing to prevent loading state from hanging
      return [];
    }
  }

  /**
   * Create a new service position (Admin only)
   */
  static async createPosition(
    groupId: string,
    data: {
      name: string;
      description?: string;
      commitmentLength?: number;
      termStartDate?: Date;
      termEndDate?: Date;
    },
  ): Promise<ServicePosition> {
    const currentUser = auth().currentUser;
    if (
      !currentUser ||
      !(await GroupModel.isGroupAdmin(groupId, currentUser.uid))
    ) {
      throw new Error('Permission denied: Only admins can create positions.');
    }

    const now = new Date();
    const positionRef = firestore()
      .collection(COLLECTION_PATHS.SERVICE_POSITIONS(groupId))
      .doc();

    const positionData: Omit<ServicePositionDocument, 'id'> = {
      groupId,
      name: data.name,
      description: data.description ?? '',
      commitmentLength: data.commitmentLength ?? null,
      currentHolderId: null,
      currentHolderName: null,
      termStartDate: data.termStartDate
        ? firestore.Timestamp.fromDate(data.termStartDate)
        : null,
      termEndDate: data.termEndDate
        ? firestore.Timestamp.fromDate(data.termEndDate)
        : null,
      createdAt: firestore.Timestamp.fromDate(now),
      updatedAt: firestore.Timestamp.fromDate(now),
    };

    try {
      await positionRef.set(positionData);
      const createdDoc = await positionRef.get();
      return this.fromFirestore(createdDoc);
    } catch (error) {
      console.error(`Error creating position in group ${groupId}:`, error);
      throw new Error('Failed to create service position.');
    }
  }

  /**
   * Update a service position (e.g., assign holder, dates) (Admin only)
   */
  static async updatePosition(
    groupId: string,
    positionId: string,
    updateData: Partial<Omit<ServicePosition, 'id' | 'groupId' | 'createdAt'>>,
  ): Promise<ServicePosition> {
    const currentUser = auth().currentUser;
    if (
      !currentUser ||
      !(await GroupModel.isGroupAdmin(groupId, currentUser.uid))
    ) {
      throw new Error('Permission denied: Only admins can update positions.');
    }

    const positionRef = firestore()
      .collection(COLLECTION_PATHS.SERVICE_POSITIONS(groupId))
      .doc(positionId);

    // Prepare Firestore update data
    const firestoreUpdate: Partial<ServicePositionDocument> = {
      updatedAt: firestore.Timestamp.now(),
    };
    if (updateData.name !== undefined) firestoreUpdate.name = updateData.name;
    if (updateData.description !== undefined)
      firestoreUpdate.description = updateData.description;
    if (updateData.commitmentLength !== undefined)
      firestoreUpdate.commitmentLength = updateData.commitmentLength ?? null;
    if (updateData.currentHolderId !== undefined)
      firestoreUpdate.currentHolderId = updateData.currentHolderId; // Can be null to unassign
    if (updateData.currentHolderName !== undefined)
      firestoreUpdate.currentHolderName = updateData.currentHolderName; // Can be null
    if (updateData.termStartDate !== undefined)
      firestoreUpdate.termStartDate = updateData.termStartDate
        ? firestore.Timestamp.fromDate(updateData.termStartDate)
        : null;
    if (updateData.termEndDate !== undefined)
      firestoreUpdate.termEndDate = updateData.termEndDate
        ? firestore.Timestamp.fromDate(updateData.termEndDate)
        : null;

    try {
      await positionRef.update(firestoreUpdate);
      const updatedDoc = await positionRef.get();
      return this.fromFirestore(updatedDoc);
    } catch (error) {
      console.error(
        `Error updating position ${positionId} in group ${groupId}:`,
        error,
      );
      throw new Error('Failed to update service position.');
    }
  }

  /**
   * Delete a service position (Admin only)
   */
  static async deletePosition(
    groupId: string,
    positionId: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (
      !currentUser ||
      !(await GroupModel.isGroupAdmin(groupId, currentUser.uid))
    ) {
      throw new Error('Permission denied: Only admins can delete positions.');
    }

    try {
      const positionRef = firestore()
        .collection(COLLECTION_PATHS.SERVICE_POSITIONS(groupId))
        .doc(positionId);
      await positionRef.delete();
    } catch (error) {
      console.error(
        `Error deleting position ${positionId} in group ${groupId}:`,
        error,
      );
      throw new Error('Failed to delete service position.');
    }
  }
}
