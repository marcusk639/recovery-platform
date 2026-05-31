import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  TreasurerHandoff,
  InitiateHandoffData,
  HandoffSummary,
} from '../types/domain/treasurer-handoff';
import {TreasurerHandoffDocument, COLLECTION_PATHS} from '../types/schema';
import {TreasuryModel} from './TreasuryModel';
import {ServicePositionModel} from './ServicePositionModel';
import {MemberModel} from './MemberModel';

/**
 * Model for managing treasurer handoff operations
 */
export class TreasurerHandoffModel {
  /**
   * Convert Firestore document to TreasurerHandoff app type
   */
  static fromFirestore(
    doc: FirebaseFirestoreTypes.DocumentSnapshot,
  ): TreasurerHandoff {
    const data = doc.data() as TreasurerHandoffDocument | undefined;
    if (!data) throw new Error(`Handoff data missing for doc ${doc.id}`);

    return {
      id: doc.id,
      groupId: data.groupId,
      positionId: data.positionId,
      previousTreasurerId: data.previousTreasurerId,
      previousTreasurerName: data.previousTreasurerName,
      newTreasurerId: data.newTreasurerId,
      newTreasurerName: data.newTreasurerName,
      balanceAtHandoff: data.balanceAtHandoff,
      prudentReserveAtHandoff: data.prudentReserveAtHandoff,
      transitionNotes: data.transitionNotes,
      rejectionReason: data.rejectionReason,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      acceptedAt: data.acceptedAt?.toDate(),
      completedAt: data.completedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
      cancelledAt: data.cancelledAt?.toDate(),
    };
  }

  /**
   * Initiate a treasurer handoff
   * Only the current treasurer can initiate
   */
  static async initiateHandoff(
    data: InitiateHandoffData,
  ): Promise<TreasurerHandoff> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to initiate a handoff');
    }

    const {
      groupId,
      positionId,
      newTreasurerId,
      newTreasurerName,
      transitionNotes,
    } = data;

    // Get current treasury stats for the snapshot
    const treasuryStats = await TreasuryModel.getTreasuryStats(groupId);

    // Verify the current user is the current treasurer for this position
    const positions = await ServicePositionModel.getPositionsForGroup(groupId);
    const position = positions.find(p => p.id === positionId);

    if (!position) {
      throw new Error('Service position not found');
    }

    if (position.currentHolderId !== currentUser.uid) {
      throw new Error('Only the current treasurer can initiate a handoff');
    }

    // Verify no pending handoff exists for this position
    const existingHandoffs = await this.getPendingHandoffsForPosition(
      groupId,
      positionId,
    );
    if (existingHandoffs.length > 0) {
      throw new Error(
        'A pending handoff already exists for this position. Please cancel it first.',
      );
    }

    // Create the handoff document
    const handoffRef = firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc();

    const now = firestore.Timestamp.now();
    const handoffData: Omit<TreasurerHandoffDocument, 'id'> = {
      groupId,
      positionId,
      previousTreasurerId: currentUser.uid,
      previousTreasurerName: currentUser.displayName || 'Unknown',
      newTreasurerId,
      newTreasurerName,
      balanceAtHandoff: treasuryStats.balance,
      prudentReserveAtHandoff: treasuryStats.prudentReserve,
      transitionNotes,
      status: 'pending',
      createdAt: now,
    };

    await handoffRef.set(handoffData);

    const createdDoc = await handoffRef.get();
    return this.fromFirestore(createdDoc);
  }

  /**
   * Accept a handoff request
   * Only the new treasurer can accept
   */
  static async acceptHandoff(
    groupId: string,
    handoffId: string,
  ): Promise<TreasurerHandoff> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to accept a handoff');
    }

    const handoffRef = firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc(handoffId);

    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) {
      throw new Error('Handoff not found');
    }

    const handoff = this.fromFirestore(handoffDoc);

    if (handoff.newTreasurerId !== currentUser.uid) {
      throw new Error(
        'Only the designated new treasurer can accept this handoff',
      );
    }

    if (handoff.status !== 'pending') {
      throw new Error(`Cannot accept a handoff with status: ${handoff.status}`);
    }

    await handoffRef.update({
      status: 'accepted',
      acceptedAt: firestore.Timestamp.now(),
    });

    const updatedDoc = await handoffRef.get();
    return this.fromFirestore(updatedDoc);
  }

  /**
   * Reject a handoff request
   * Only the new treasurer can reject
   */
  static async rejectHandoff(
    groupId: string,
    handoffId: string,
    reason?: string,
  ): Promise<TreasurerHandoff> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to reject a handoff');
    }

    const handoffRef = firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc(handoffId);

    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) {
      throw new Error('Handoff not found');
    }

    const handoff = this.fromFirestore(handoffDoc);

    if (handoff.newTreasurerId !== currentUser.uid) {
      throw new Error(
        'Only the designated new treasurer can reject this handoff',
      );
    }

    if (handoff.status !== 'pending') {
      throw new Error(`Cannot reject a handoff with status: ${handoff.status}`);
    }

    await handoffRef.update({
      status: 'rejected',
      rejectedAt: firestore.Timestamp.now(),
      rejectionReason: reason,
    });

    const updatedDoc = await handoffRef.get();
    return this.fromFirestore(updatedDoc);
  }

  /**
   * Complete a handoff - finalize the role transfer
   * Only the previous (current) treasurer can complete after acceptance
   */
  static async completeHandoff(
    groupId: string,
    handoffId: string,
  ): Promise<TreasurerHandoff> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to complete a handoff');
    }

    const handoffRef = firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc(handoffId);

    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) {
      throw new Error('Handoff not found');
    }

    const handoff = this.fromFirestore(handoffDoc);

    if (handoff.previousTreasurerId !== currentUser.uid) {
      throw new Error('Only the outgoing treasurer can complete the handoff');
    }

    if (handoff.status !== 'accepted') {
      throw new Error(
        `Cannot complete a handoff with status: ${handoff.status}. The new treasurer must accept first.`,
      );
    }

    // Use a batch to update both the handoff and the service position atomically
    const batch = firestore().batch();

    // Update handoff status
    batch.update(handoffRef, {
      status: 'completed',
      completedAt: firestore.Timestamp.now(),
    });

    // Update the service position with new holder
    const positionRef = firestore()
      .collection(COLLECTION_PATHS.SERVICE_POSITIONS(groupId))
      .doc(handoff.positionId);

    batch.update(positionRef, {
      currentHolderId: handoff.newTreasurerId,
      currentHolderName: handoff.newTreasurerName,
      termStartDate: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    });

    await batch.commit();

    const updatedDoc = await handoffRef.get();
    return this.fromFirestore(updatedDoc);
  }

  /**
   * Cancel a pending handoff
   * Only the previous (initiating) treasurer can cancel
   */
  static async cancelHandoff(
    groupId: string,
    handoffId: string,
  ): Promise<TreasurerHandoff> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to cancel a handoff');
    }

    const handoffRef = firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc(handoffId);

    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) {
      throw new Error('Handoff not found');
    }

    const handoff = this.fromFirestore(handoffDoc);

    if (handoff.previousTreasurerId !== currentUser.uid) {
      throw new Error('Only the initiating treasurer can cancel a handoff');
    }

    if (handoff.status === 'completed') {
      throw new Error('Cannot cancel a completed handoff');
    }

    await handoffRef.update({
      status: 'cancelled',
      cancelledAt: firestore.Timestamp.now(),
    });

    const updatedDoc = await handoffRef.get();
    return this.fromFirestore(updatedDoc);
  }

  /**
   * Get a specific handoff by ID
   */
  static async getHandoffById(
    groupId: string,
    handoffId: string,
  ): Promise<TreasurerHandoff | null> {
    const handoffDoc = await firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .doc(handoffId)
      .get();

    if (!handoffDoc.exists) {
      return null;
    }

    return this.fromFirestore(handoffDoc);
  }

  /**
   * Get handoff history for a group
   */
  static async getHandoffHistory(groupId: string): Promise<TreasurerHandoff[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc));
  }

  /**
   * Get pending handoffs for a specific position
   */
  static async getPendingHandoffsForPosition(
    groupId: string,
    positionId: string,
  ): Promise<TreasurerHandoff[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.TREASURER_HANDOFFS(groupId))
      .where('positionId', '==', positionId)
      .where('status', 'in', ['pending', 'accepted'])
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc));
  }

  /**
   * Get pending handoffs where user is the new treasurer
   * This is used to show pending requests to the user
   */
  static async getPendingHandoffsForUser(
    userId: string,
  ): Promise<TreasurerHandoff[]> {
    // Note: This requires querying across all groups, which may need a different approach
    // For now, we'll use a collection group query
    const snapshot = await firestore()
      .collectionGroup('treasurerHandoffs')
      .where('newTreasurerId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc));
  }

  /**
   * Get accepted handoffs waiting for completion by the current user
   */
  static async getAcceptedHandoffsForUser(
    userId: string,
  ): Promise<TreasurerHandoff[]> {
    const snapshot = await firestore()
      .collectionGroup('treasurerHandoffs')
      .where('previousTreasurerId', '==', userId)
      .where('status', '==', 'accepted')
      .get();

    return snapshot.docs.map(doc => this.fromFirestore(doc));
  }
}
