import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  COLLECTION_PATHS,
  ReportDocument,
  UserBanDocument,
  FirestoreDocument,
  ReportReason,
  ReportStatus,
  ReportAction,
  ReportContentType,
} from '../types/schema';
import {UserModel} from './UserModel';
import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

/**
 * Report type for app representation
 */
export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  groupId: string;
  contentType: ReportContentType;
  contentId?: string;
  contentSnapshot?: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  action?: ReportAction;
  adminNotes?: string;
  createdAt: Date;
}

/**
 * User Ban type for app representation
 */
export interface UserBan {
  id: string;
  userId: string;
  userName: string;
  groupId?: string;
  bannedBy: string;
  bannedByName: string;
  reason: string;
  reportId?: string;
  bannedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revokedByName?: string;
}

/**
 * Input type for creating a new report
 */
export interface CreateReportInput {
  reportedUserId: string;
  reportedUserName: string;
  groupId: string;
  contentType: ReportContentType;
  contentId?: string;
  contentSnapshot?: string;
  reason: ReportReason;
  description?: string;
}

/**
 * Input type for creating a user ban
 */
export interface CreateBanInput {
  userId: string;
  userName: string;
  groupId?: string;
  reason: string;
  reportId?: string;
  durationDays?: number; // null for permanent
}

/**
 * Report model for managing content reports and user bans
 */
export class ReportModel {
  /**
   * Convert a Firestore report document to a Report object
   */
  static reportFromFirestore(doc: FirestoreDocument<ReportDocument>): Report {
    const data = doc.data();
    return {
      id: doc.id,
      reporterId: data.reporterId,
      reporterName: data.reporterName,
      reportedUserId: data.reportedUserId,
      reportedUserName: data.reportedUserName,
      groupId: data.groupId,
      contentType: data.contentType,
      contentId: data.contentId,
      contentSnapshot: data.contentSnapshot,
      reason: data.reason,
      description: data.description,
      status: data.status,
      reviewedBy: data.reviewedBy,
      reviewedByName: data.reviewedByName,
      reviewedAt: data.reviewedAt?.toDate(),
      action: data.action,
      adminNotes: data.adminNotes,
      createdAt: data.createdAt.toDate(),
    };
  }

  /**
   * Convert a Firestore user ban document to a UserBan object
   */
  static banFromFirestore(doc: FirestoreDocument<UserBanDocument>): UserBan {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      userName: data.userName,
      groupId: data.groupId,
      bannedBy: data.bannedBy,
      bannedByName: data.bannedByName,
      reason: data.reason,
      reportId: data.reportId,
      bannedAt: data.bannedAt.toDate(),
      expiresAt: data.expiresAt?.toDate(),
      isActive: data.isActive,
      revokedAt: data.revokedAt?.toDate(),
      revokedBy: data.revokedBy,
      revokedByName: data.revokedByName,
    };
  }

  /**
   * Create a new report
   */
  static async createReport(input: CreateReportInput): Promise<Report> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    const reportRef = firestore().collection(COLLECTION_PATHS.REPORTS).doc();
    const now = firestore.Timestamp.now();

    const reportData: Omit<ReportDocument, 'id'> & {id: string} = {
      id: reportRef.id,
      reporterId: currentUser.uid,
      reporterName: currentUser.displayName || 'Anonymous',
      reportedUserId: input.reportedUserId,
      reportedUserName: input.reportedUserName,
      groupId: input.groupId,
      contentType: input.contentType,
      contentId: input.contentId,
      contentSnapshot: input.contentSnapshot,
      reason: input.reason,
      description: input.description,
      status: 'pending',
      createdAt: now,
    };

    // Remove undefined fields
    const cleanData = Object.fromEntries(
      Object.entries(reportData).filter(([_, v]) => v !== undefined),
    );

    await reportRef.set(cleanData);

    return {
      id: reportRef.id,
      reporterId: currentUser.uid,
      reporterName: currentUser.displayName || 'Anonymous',
      reportedUserId: input.reportedUserId,
      reportedUserName: input.reportedUserName,
      groupId: input.groupId,
      contentType: input.contentType,
      contentId: input.contentId,
      contentSnapshot: input.contentSnapshot,
      reason: input.reason,
      description: input.description,
      status: 'pending',
      createdAt: now.toDate(),
    };
  }

  /**
   * Get reports for a specific group (for group admins)
   */
  static async getReportsByGroup(groupId: string): Promise<Report[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.reportFromFirestore({
        id: doc.id,
        data: () => doc.data() as ReportDocument,
      }),
    );
  }

  /**
   * Get all pending reports (for super admins)
   */
  static async getAllPendingReports(): Promise<Report[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.reportFromFirestore({
        id: doc.id,
        data: () => doc.data() as ReportDocument,
      }),
    );
  }

  /**
   * Get a single report by ID
   */
  static async getReportById(reportId: string): Promise<Report | null> {
    const doc = await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .doc(reportId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return this.reportFromFirestore({
      id: doc.id,
      data: () => doc.data() as ReportDocument,
    });
  }

  /**
   * Update report status (admin review action)
   */
  static async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    action?: ReportAction,
    adminNotes?: string,
  ): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    const updateData: Partial<ReportDocument> = {
      status,
      reviewedBy: currentUser.uid,
      reviewedByName: currentUser.displayName || 'Admin',
      reviewedAt: firestore.Timestamp.now(),
    };

    if (action) {
      updateData.action = action;
    }
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }

    await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .doc(reportId)
      .update(updateData);
  }

  /**
   * Get reports against a specific user
   */
  static async getUserReports(userId: string): Promise<Report[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .where('reportedUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.reportFromFirestore({
        id: doc.id,
        data: () => doc.data() as ReportDocument,
      }),
    );
  }

  /**
   * Get count of pending reports for a group
   */
  static async getPendingReportCount(groupId: string): Promise<number> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .where('groupId', '==', groupId)
      .where('status', '==', 'pending')
      .get();

    return snapshot.size;
  }

  // ==================== User Ban Methods ====================

  /**
   * Create a user ban
   */
  static async createUserBan(input: CreateBanInput): Promise<UserBan> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    const banRef = firestore().collection(COLLECTION_PATHS.USER_BANS).doc();
    const now = firestore.Timestamp.now();

    // Calculate expiry date if duration is provided
    let expiresAt: FirebaseFirestoreTypes.Timestamp | undefined;
    let expiresAtDate: Date | undefined;
    if (input.durationDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + input.durationDays);
      expiresAt = firestore.Timestamp.fromDate(expiryDate);
      expiresAtDate = expiryDate;
    }

    const banData: Omit<UserBanDocument, 'id'> & {id: string} = {
      id: banRef.id,
      userId: input.userId,
      userName: input.userName,
      groupId: input.groupId ?? undefined,
      bannedBy: currentUser.uid,
      bannedByName: currentUser.displayName || 'Admin',
      reason: input.reason,
      reportId: input.reportId,
      bannedAt: now,
      expiresAt,
      isActive: true,
    };

    // Remove undefined fields but preserve null values (e.g. groupId: null for platform bans)
    const cleanData = Object.fromEntries(
      Object.entries(banData).filter(([_, v]) => v !== undefined),
    );

    await banRef.set(cleanData);

    return {
      id: banRef.id,
      userId: input.userId,
      userName: input.userName,
      groupId: input.groupId,
      bannedBy: currentUser.uid,
      bannedByName: currentUser.displayName || 'Admin',
      reason: input.reason,
      reportId: input.reportId,
      bannedAt: now.toDate(),
      expiresAt: expiresAtDate,
      isActive: true,
    };
  }

  /**
   * Get all bans for a specific user
   */
  static async getUserBans(userId: string): Promise<UserBan[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .where('userId', '==', userId)
      .orderBy('bannedAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.banFromFirestore({
        id: doc.id,
        data: () => doc.data() as UserBanDocument,
      }),
    );
  }

  /**
   * Get all bans for a specific group
   */
  static async getGroupBans(groupId: string): Promise<UserBan[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .where('groupId', '==', groupId)
      .orderBy('bannedAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.banFromFirestore({
        id: doc.id,
        data: () => doc.data() as UserBanDocument,
      }),
    );
  }

  /**
   * Get active bans for a group
   */
  static async getActiveGroupBans(groupId: string): Promise<UserBan[]> {
    const snapshot = await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .where('groupId', '==', groupId)
      .where('isActive', '==', true)
      .orderBy('bannedAt', 'desc')
      .get();

    return snapshot.docs.map(doc =>
      this.banFromFirestore({
        id: doc.id,
        data: () => doc.data() as UserBanDocument,
      }),
    );
  }

  /**
   * Check if a user is banned from a group or platform-wide
   */
  static async isUserBanned(
    userId: string,
    groupId?: string,
  ): Promise<{isBanned: boolean; ban?: UserBan}> {
    const now = new Date();

    // Check for platform-wide ban first
    const platformBanSnapshot = await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .where('groupId', '==', null)
      .limit(1)
      .get();

    if (!platformBanSnapshot.empty) {
      const ban = this.banFromFirestore({
        id: platformBanSnapshot.docs[0].id,
        data: () => platformBanSnapshot.docs[0].data() as UserBanDocument,
      });

      // Check if ban has expired
      if (!ban.expiresAt || ban.expiresAt > now) {
        return {isBanned: true, ban};
      }
    }

    // If groupId provided, check for group-specific ban
    if (groupId) {
      const groupBanSnapshot = await firestore()
        .collection(COLLECTION_PATHS.USER_BANS)
        .where('userId', '==', userId)
        .where('groupId', '==', groupId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!groupBanSnapshot.empty) {
        const ban = this.banFromFirestore({
          id: groupBanSnapshot.docs[0].id,
          data: () => groupBanSnapshot.docs[0].data() as UserBanDocument,
        });

        // Check if ban has expired
        if (!ban.expiresAt || ban.expiresAt > now) {
          return {isBanned: true, ban};
        }
      }
    }

    return {isBanned: false};
  }

  /**
   * Revoke a ban early
   */
  static async revokeBan(banId: string): Promise<void> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .doc(banId)
      .update({
        isActive: false,
        revokedAt: firestore.Timestamp.now(),
        revokedBy: currentUser.uid,
        revokedByName: currentUser.displayName || 'Admin',
      });
  }

  /**
   * Get a single ban by ID
   */
  static async getBanById(banId: string): Promise<UserBan | null> {
    const doc = await firestore()
      .collection(COLLECTION_PATHS.USER_BANS)
      .doc(banId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return this.banFromFirestore({
      id: doc.id,
      data: () => doc.data() as UserBanDocument,
    });
  }

  /**
   * Listen for reports in real-time (for admin queue)
   */
  static listenForGroupReports(
    groupId: string,
    callback: (reports: Report[]) => void,
  ): () => void {
    const unsubscribe = firestore()
      .collection(COLLECTION_PATHS.REPORTS)
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snapshot => {
          const reports = snapshot.docs.map(doc =>
            this.reportFromFirestore({
              id: doc.id,
              data: () => doc.data() as ReportDocument,
            }),
          );
          callback(reports);
        },
        error => {
          console.error('Error listening for reports:', error);
        },
      );

    return unsubscribe;
  }
}
