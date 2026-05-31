import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import {
  Sponsorship,
  SponsorshipAnalytics,
  SponsorSettings,
} from '../types/sponsorship';
import {UserModel} from './UserModel';
import {Timestamp, UserDocument} from '../types/schema';
import {GroupModel} from './GroupModel';
import {FirestoreDocument} from '../types';

interface SponsorDocument {
  id: string;
  displayName: string;
  sobrietyStartDate: string;
  sponsorSettings?: {
    requirements: string[];
    bio: string;
    maxSponsees: number;
    isAvailable: boolean;
  };
}

interface SponsorshipRequestDocument {
  id: string;
  sponseeId: string;
  sponseeName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
}

interface SponsorshipDocument {
  groupId: string;
  sponsorId: string;
  sponseeId: string;
  sponsorName: string;
  sponseeName: string;
  status: 'active' | 'completed' | 'terminated';
  startDate: Timestamp;
  endDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Sponsor {
  id: string;
  displayName: string;
  sobrietyDate: string;
  requirements: string[];
  bio: string;
  currentSponsees: number;
  maxSponsees: number;
}

interface SponsorshipRequest {
  id: string;
  sponseeId: string;
  sponseeName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
}

class SponsorModel {
  private static instance: SponsorModel;

  private constructor() {}

  static getInstance(): SponsorModel {
    if (!SponsorModel.instance) {
      SponsorModel.instance = new SponsorModel();
    }
    return SponsorModel.instance;
  }

  static sponsorshipFromFirestore(
    doc: FirebaseFirestoreTypes.DocumentSnapshot<SponsorshipDocument>,
  ): Sponsorship {
    const data = doc.data();
    if (!data) throw new Error('Sponsorship document not found');

    return {
      id: doc.id,
      sponsorId: data.sponsorId,
      sponseeId: data.sponseeId,
      status: data.status,
      startDate: data.startDate.toDate(),
      endDate: data.endDate?.toDate() || null,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      groupId: data.groupId,
      sponsorName: data.sponsorName,
      sponseeName: data.sponseeName,
    };
  }

  static sponsorFromFirestore(
    doc: FirebaseFirestoreTypes.DocumentSnapshot<SponsorDocument>,
  ): Sponsor {
    const data = doc.data();
    if (!data) throw new Error('Sponsor document not found');

    return {
      id: doc.id,
      displayName: data.displayName,
      sobrietyDate: data.sobrietyStartDate,
      requirements: data.sponsorSettings?.requirements || [],
      bio: data.sponsorSettings?.bio || '',
      currentSponsees: 0, // This will be updated in getGroupSponsors
      maxSponsees: data.sponsorSettings?.maxSponsees || 0,
    };
  }

  static requestFromFirestore(
    doc: FirebaseFirestoreTypes.DocumentSnapshot<SponsorshipRequestDocument>,
  ): SponsorshipRequest {
    const data = doc.data();
    if (!data) throw new Error('Request document not found');

    return {
      id: doc.id,
      sponseeId: data.sponseeId,
      sponseeName: data.sponseeName,
      message: data.message,
      status: data.status,
      createdAt: data.createdAt,
    };
  }

  async getGroupSponsorships(groupId: string): Promise<Sponsorship[]> {
    try {
      const snapshot = await firestore()
        .collection('sponsorships')
        .where('groupId', '==', groupId)
        .get();

      return snapshot.docs.map(doc =>
        SponsorModel.sponsorshipFromFirestore(
          doc as FirebaseFirestoreTypes.DocumentSnapshot<SponsorshipDocument>,
        ),
      );
    } catch (error) {
      console.error('Error fetching group sponsorships:', error);
      throw error;
    }
  }

  async getSponsorshipAnalytics(
    groupId: string,
  ): Promise<SponsorshipAnalytics> {
    try {
      const sponsorshipsRef = firestore()
        .collection('sponsorships')
        .where('groupId', '==', groupId);

      // Get all sponsorships
      const sponsorshipsSnapshot = await sponsorshipsRef.get();
      const sponsorships = sponsorshipsSnapshot.docs.map(doc =>
        SponsorModel.sponsorshipFromFirestore(
          doc as FirebaseFirestoreTypes.DocumentSnapshot<SponsorshipDocument>,
        ),
      );

      // Calculate success rate
      const successfulSponsorships = sponsorships.filter(
        s => s.status === 'completed',
      ).length;
      const successRate =
        sponsorships.length > 0
          ? (successfulSponsorships / sponsorships.length) * 100
          : 0;

      // Calculate average duration for completed sponsorships only
      const completedSponsorships = sponsorships.filter(
        s => s.status === 'completed' && s.endDate,
      );
      const durations = completedSponsorships.map(s => {
        const start = s.startDate.getTime();
        const end = s.endDate!.getTime();
        return (end - start) / (1000 * 60 * 60 * 24); // Duration in days
      });
      const averageDuration =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      // Get common challenges
      const challengesRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('challenges');
      const challengesSnapshot = await challengesRef.get();
      const challenges = challengesSnapshot.docs.map(doc => doc.data());
      const challengeCounts = challenges.reduce((acc, challenge) => {
        acc[challenge.type] = (acc[challenge.type] || 0) + 1;
        return acc;
      }, {});
      const commonChallenges = Object.entries(challengeCounts)
        .map(([challenge, count]) => ({challenge, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get solutions
      const solutionsRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('solutions');
      const solutionsSnapshot = await solutionsRef.get();
      const solutions = solutionsSnapshot.docs.map(doc => doc.data());
      const solutionSuccessRates = solutions.map(solution => ({
        solution: solution.description,
        successRate: solution.successRate,
      }));

      return {
        successRate,
        averageDuration,
        commonChallenges,
        solutions: solutionSuccessRates,
      };
    } catch (error) {
      console.error('Error fetching sponsorship analytics:', error);
      throw error;
    }
  }

  async createSponsorship(
    groupId: string,
    sponsorId: string,
    sponseeId: string,
  ): Promise<string> {
    try {
      const docRef = await firestore().collection('sponsorships').add({
        groupId,
        sponsorId,
        sponseeId,
        status: 'active',
        startDate: firestore.FieldValue.serverTimestamp(),
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      console.error('Error creating sponsorship:', error);
      throw error;
    }
  }

  async updateSponsorshipStatus(
    groupId: string,
    sponsorshipId: string,
    status: 'active' | 'completed' | 'terminated',
  ): Promise<void> {
    try {
      await firestore()
        .collection('sponsorships')
        .doc(sponsorshipId)
        .update({
          status,
          endDate:
            status !== 'active' ? firestore.FieldValue.serverTimestamp() : null,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      console.error('Error updating sponsorship status:', error);
      throw error;
    }
  }

  async getSponsorChatMessages(
    groupId: string,
    sponsorId: string,
    sponseeId: string,
  ): Promise<any[]> {
    try {
      const chatId = [sponsorId, sponseeId].sort().join('_');
      const snapshot = await firestore()
        .collection('sponsorChats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate(),
      }));
    } catch (error) {
      console.error('Error fetching sponsor chat messages:', error);
      throw error;
    }
  }

  async sendSponsorChatMessage(
    groupId: string,
    sponsorId: string,
    sponseeId: string,
    message: string,
    senderId: string,
  ): Promise<void> {
    try {
      const chatId = [sponsorId, sponseeId].sort().join('_');
      await firestore()
        .collection('sponsorChats')
        .doc(chatId)
        .collection('messages')
        .add({
          text: message,
          senderId,
          timestamp: firestore.FieldValue.serverTimestamp(),
          isRead: false,
        });
    } catch (error) {
      console.error('Error sending sponsor chat message:', error);
      throw error;
    }
  }

  async getGroupSponsors(groupId: string): Promise<Sponsor[]> {
    try {
      const groupMembers = await GroupModel.getMembers(groupId);

      if (!groupMembers || !groupMembers.length) return [];

      // Get all potential sponsors (users with sponsorSettings.isAvailable = true)
      // Extract userId from members and batch into groups of 30 (Firestore 'in' query limit)
      const userIds = groupMembers.map(member => member.userId);
      const batches: string[][] = [];
      for (let i = 0; i < userIds.length; i += 30) {
        batches.push(userIds.slice(i, i + 30));
      }

      const sponsorsDocs: FirebaseFirestoreTypes.QueryDocumentSnapshot[] = [];
      for (const batch of batches) {
        const snapshot = await firestore()
          .collection('users')
          .where('sponsorSettings.isAvailable', '==', true)
          .where(firestore.FieldPath.documentId(), 'in', batch)
          .get();
        sponsorsDocs.push(...snapshot.docs);
      }

      const sponsorsSnapshot = {docs: sponsorsDocs};

      const sponsorUsers = sponsorsSnapshot.docs.map(doc =>
        UserModel.fromFirestore(
          doc as unknown as FirestoreDocument<UserDocument>,
        ),
      );

      return sponsorUsers
        .map(sponsor => {
          return {
            id: sponsor.uid,
            displayName: sponsor.displayName,
            sobrietyDate: sponsor.recoveryDate!,
            requirements: sponsor.sponsorSettings?.requirements || [],
            bio: sponsor.sponsorSettings?.bio || '',
          } as Sponsor;
        })
        .filter(
          (sponsor): sponsor is NonNullable<typeof sponsor> => sponsor !== null,
        );
    } catch (error) {
      console.error('Error fetching group sponsors:', error);
      throw error;
    }
  }

  async requestSponsorship(
    groupId: string,
    sponsorId: string,
    message: string,
  ): Promise<{groupId: string; request: SponsorshipRequest}> {
    try {
      const currentUser = await UserModel.getCurrentUser();
      if (!currentUser) throw new Error('User not authenticated');

      // Check if user already has an active sponsor or pending request
      const [activeSponsorship, pendingRequest] = await Promise.all([
        firestore()
          .collection('sponsorships')
          .where('groupId', '==', groupId)
          .where('sponseeId', '==', currentUser.uid)
          .where('status', '==', 'active')
          .get(),
        firestore()
          .collection('groups')
          .doc(groupId)
          .collection('sponsorshipRequests')
          .where('sponseeId', '==', currentUser.uid)
          .where('status', '==', 'pending')
          .get(),
      ]);

      if (!activeSponsorship.empty) {
        throw new Error('You already have an active sponsor');
      }

      if (!pendingRequest.empty) {
        throw new Error('You already have a pending sponsorship request');
      }

      // Check if the requested sponsor is available
      const sponsorDoc = await firestore()
        .collection('users')
        .doc(sponsorId)
        .get();

      const sponsorData = sponsorDoc.data();
      if (!sponsorData?.sponsorSettings?.isAvailable) {
        throw new Error('This sponsor is not currently available');
      }

      const requestRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('sponsorshipRequests')
        .doc();

      const request = {
        id: requestRef.id,
        sponseeId: currentUser.uid,
        sponseeName: currentUser.displayName,
        message,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      };

      await requestRef.set(request);

      // Get the created document to get the actual Timestamp
      const createdDoc = await requestRef.get();
      return {
        groupId,
        request: SponsorModel.requestFromFirestore(
          createdDoc as FirebaseFirestoreTypes.DocumentSnapshot<SponsorshipRequestDocument>,
        ),
      };
    } catch (error) {
      console.error('Error requesting sponsorship:', error);
      throw error;
    }
  }

  async acceptSponsorshipRequest(groupId: string, requestId: string) {
    try {
      const currentUser = await UserModel.getCurrentUser();
      if (!currentUser) throw new Error('User not authenticated');

      const requestRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('sponsorshipRequests')
        .doc(requestId);

      const requestDoc = await requestRef.get();
      const request = requestDoc.data();

      if (!request) throw new Error('Request not found');
      if (request.status !== 'pending')
        throw new Error('Request already processed');

      // Update request status
      await requestRef.update({status: 'accepted'});

      // Create sponsorship
      const sponsorshipRef = firestore().collection('sponsorships').doc();

      const sponsorship = {
        id: sponsorshipRef.id,
        groupId,
        sponsorId: currentUser.uid,
        sponseeId: request.sponseeId,
        status: 'active',
        startDate: firestore.FieldValue.serverTimestamp(),
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      await sponsorshipRef.set(sponsorship);
      return {groupId, requestId};
    } catch (error) {
      console.error('Error accepting sponsorship request:', error);
      throw error;
    }
  }

  async rejectSponsorshipRequest(groupId: string, requestId: string) {
    try {
      const requestRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('sponsorshipRequests')
        .doc(requestId);

      const requestDoc = await requestRef.get();
      const request = requestDoc.data();

      if (!request) throw new Error('Request not found');
      if (request.status !== 'pending')
        throw new Error('Request already processed');

      await requestRef.update({status: 'rejected'});
      return {groupId, requestId};
    } catch (error) {
      console.error('Error rejecting sponsorship request:', error);
      throw error;
    }
  }

  async updateSponsorAvailability(groupId: string, isAvailable: boolean) {
    try {
      const currentUser = await UserModel.getCurrentUser();
      if (!currentUser) throw new Error('User not authenticated');

      const userRef = firestore().collection('users').doc(currentUser.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data();

      if (!userData) throw new Error('User data not found');

      const currentSettings: SponsorSettings = userData.sponsorSettings || {
        isAvailable: false,
        maxSponsees: 3,
        requirements: [],
        bio: '',
      };

      const updatedSettings: SponsorSettings = {
        ...currentSettings,
        isAvailable,
      };

      await userRef.update({sponsorSettings: updatedSettings});
      return {groupId, isAvailable};
    } catch (error) {
      console.error('Error updating sponsor availability:', error);
      throw error;
    }
  }

  private async getActiveSponsorships(sponsorId: string) {
    try {
      const snapshot = await firestore()
        .collectionGroup('sponsorships')
        .where('sponsorId', '==', sponsorId)
        .where('status', '==', 'active')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Sponsorship[];
    } catch (error) {
      console.error('Error fetching active sponsorships:', error);
      throw error;
    }
  }
}

export default SponsorModel;
