import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import {MemberModel} from '../../models/MemberModel';
import {
  Sponsorship,
  SponsorshipAnalytics,
  SponsorChatMessage,
  SponsorSettings,
} from '../../types/sponsorship';
import {RootState} from '../types';
import {Timestamp} from '../../types/schema';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// Define proper entity types
export interface SponsorshipEntity {
  id: string;
  groupId: string;
  sponsorId: string;
  sponseeId: string;
  sponsorName: string;
  sponseeName: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'ended' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface SponsorEntity {
  id: string;
  displayName: string;
  sobrietyDate: string;
  requirements: string[];
  bio: string;
}

export interface SponsorshipRequestEntity {
  id: string;
  sponseeId: string;
  sponseeName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
}

// Create entity adapters for better performance
const sponsorshipsAdapter = createEntityAdapter({
  selectId: (sponsorship: SponsorshipEntity) => sponsorship.id,
  sortComparer: (a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
});

const sponsorsAdapter = createEntityAdapter({
  selectId: (sponsor: SponsorEntity) => sponsor.id,
  sortComparer: (a, b) => a.displayName.localeCompare(b.displayName),
});

const sponsorshipRequestsAdapter = createEntityAdapter({
  selectId: (request: SponsorshipRequestEntity) => request.id,
  sortComparer: (a, b) =>
    b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime(),
});

// Update state interface
export interface SponsorshipState {
  sponsorships: ReturnType<typeof sponsorshipsAdapter.getInitialState>;
  analytics: SponsorshipAnalytics | null;
  chatMessages: Record<string, SponsorChatMessage[]>;
  loading: boolean;
  error: string | null;
  sponsors: ReturnType<typeof sponsorsAdapter.getInitialState>;
  sponsorshipRequests: ReturnType<
    typeof sponsorshipRequestsAdapter.getInitialState
  >;
  groupSponsors: Record<string, string[]>;
}

const initialState: SponsorshipState = {
  sponsorships: sponsorshipsAdapter.getInitialState(),
  analytics: null,
  chatMessages: {},
  loading: false,
  error: null,
  sponsors: sponsorsAdapter.getInitialState(),
  sponsorshipRequests: sponsorshipRequestsAdapter.getInitialState(),
  groupSponsors: {},
};

const convertToSponsorshipEntity = (
  sponsorship: Sponsorship,
): SponsorshipEntity => ({
  id: sponsorship.id,
  groupId: sponsorship.groupId,
  sponsorId: sponsorship.sponsorId,
  sponseeId: sponsorship.sponseeId,
  sponsorName: sponsorship.sponsorName,
  sponseeName: sponsorship.sponseeName,
  startDate: sponsorship.startDate.toISOString(),
  endDate: sponsorship.endDate?.toISOString() || null,
  status:
    sponsorship.status === 'completed'
      ? 'ended'
      : sponsorship.status === 'terminated'
      ? 'ended'
      : sponsorship.status,
  createdAt: sponsorship.createdAt.toISOString(),
  updatedAt: sponsorship.updatedAt.toISOString(),
});

export const fetchGroupSponsorships = createAsyncThunk(
  'sponsorship/fetchGroupSponsorships',
  async (groupId: string) => {
    const snapshot = await firestore()
      .collection('sponsorships')
      .where('groupId', '==', groupId)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Sponsorship[];
  },
);

export const fetchSponsorshipAnalytics = createAsyncThunk(
  'sponsorship/fetchAnalytics',
  async (groupId: string) => {
    const sponsorshipsRef = firestore()
      .collection('sponsorships')
      .where('groupId', '==', groupId);

    const sponsorshipsSnapshot = await sponsorshipsRef.get();
    const sponsorships = sponsorshipsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Sponsorship[];

    const successfulSponsorships = sponsorships.filter(
      s => s.status === 'completed',
    ).length;
    const successRate =
      sponsorships.length > 0
        ? (successfulSponsorships / sponsorships.length) * 100
        : 0;

    const completedSponsorships = sponsorships.filter(
      s => s.status === 'completed' && s.endDate,
    );
    const durations = completedSponsorships.map(s => {
      const start = s.startDate.getTime();
      const end = s.endDate!.getTime();
      return (end - start) / (1000 * 60 * 60 * 24);
    });
    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

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
  },
);

export const createNewSponsorship = createAsyncThunk(
  'sponsorship/create',
  async ({
    groupId,
    sponsorId,
    sponseeId,
  }: {
    groupId: string;
    sponsorId: string;
    sponseeId: string;
  }) => {
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
  },
);

export const updateSponsorshipStatus = createAsyncThunk(
  'sponsorship/updateStatus',
  async ({
    groupId,
    sponsorshipId,
    status,
  }: {
    groupId: string;
    sponsorshipId: string;
    status: 'active' | 'completed' | 'terminated';
  }) => {
    await firestore()
      .collection('sponsorships')
      .doc(sponsorshipId)
      .update({
        status,
        endDate:
          status !== 'active' ? firestore.FieldValue.serverTimestamp() : null,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    return {sponsorshipId, status};
  },
);

export const fetchSponsorChatMessages = createAsyncThunk(
  'sponsorship/fetchChatMessages',
  async ({
    groupId,
    sponsorId,
    sponseeId,
  }: {
    groupId: string;
    sponsorId: string;
    sponseeId: string;
  }) => {
    const chatId = [sponsorId, sponseeId].sort().join('_');
    const snapshot = await firestore()
      .collection('sponsorChats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();

    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text,
        senderId: data.senderId,
        timestamp: data.timestamp.toDate(),
        isRead: data.isRead,
      } as SponsorChatMessage;
    });
    return {sponsorId, sponseeId, messages};
  },
);

export const sendSponsorChatMessage = createAsyncThunk(
  'sponsorship/sendChatMessage',
  async ({
    groupId,
    sponsorId,
    sponseeId,
    message,
    senderId,
  }: {
    groupId: string;
    sponsorId: string;
    sponseeId: string;
    message: string;
    senderId: string;
  }) => {
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
    return {sponsorId, sponseeId, message, senderId};
  },
);

export const fetchGroupSponsors = createAsyncThunk(
  'sponsorship/fetchGroupSponsors',
  async (groupId: string) => {
    const members = await MemberModel.getGroupMembers(groupId);
    return members
      .filter(member => member.sponsorSettings?.isAvailable)
      .map(member => ({
        id: member.id,
        displayName: member.name,
        sobrietyDate: member.sobrietyDate || '',
        requirements: member.sponsorSettings?.requirements || [],
        bio: member.sponsorSettings?.bio || '',
      }));
  },
);

export const requestSponsorship = createAsyncThunk(
  'sponsorship/request',
  async ({
    groupId,
    sponsorId,
    message,
  }: {
    groupId: string;
    sponsorId: string;
    message: string;
  }) => {
    const currentUser = auth().currentUser;
    if (!currentUser) throw new Error('User not authenticated');

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

    const requestRef = firestore()
      .collection('groups')
      .doc(groupId)
      .collection('sponsorshipRequests')
      .doc();

    const request = {
      id: requestRef.id,
      sponsorId, // Include the target sponsor's ID
      sponseeId: currentUser.uid,
      sponseeName: currentUser.displayName || 'Anonymous',
      message,
      status: 'pending',
      createdAt: firestore.FieldValue.serverTimestamp(),
    };

    await requestRef.set(request);

    const createdDoc = await requestRef.get();
    const requestData = createdDoc.data();
    if (!requestData) throw new Error('Failed to create request');

    return {
      groupId,
      sponsorId,
      request: {
        id: createdDoc.id,
        sponsorId: requestData.sponsorId,
        sponseeId: requestData.sponseeId,
        sponseeName: requestData.sponseeName,
        message: requestData.message,
        status: requestData.status,
        createdAt: requestData.createdAt,
      },
    };
  },
);

export const acceptSponsorshipRequest = createAsyncThunk(
  'sponsorship/acceptRequest',
  async ({groupId, requestId}: {groupId: string; requestId: string}) => {
    const currentUser = auth().currentUser;
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

    // Get sponsor (current user) name
    const sponsorDoc = await firestore()
      .collection('users')
      .doc(currentUser.uid)
      .get();
    const sponsorData = sponsorDoc.data();
    const sponsorName = sponsorData?.displayName || currentUser.displayName || 'Unknown';

    await requestRef.update({status: 'accepted'});

    const sponsorshipRef = firestore().collection('sponsorships').doc();

    const sponsorship = {
      id: sponsorshipRef.id,
      groupId,
      sponsorId: currentUser.uid, // The person accepting is the sponsor
      sponsorName,
      sponseeId: request.sponseeId, // The person who made the request is the sponsee
      sponseeName: request.sponseeName,
      status: 'active',
      startDate: firestore.FieldValue.serverTimestamp(),
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    };

    await sponsorshipRef.set(sponsorship);
    return {groupId, requestId, sponsorship};
  },
);

export const rejectSponsorshipRequest = createAsyncThunk(
  'sponsorship/rejectRequest',
  async ({groupId, requestId}: {groupId: string; requestId: string}) => {
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
  },
);

export const updateSponsorAvailability = createAsyncThunk(
  'sponsorship/updateAvailability',
  async ({groupId, isAvailable}: {groupId: string; isAvailable: boolean}) => {
    const currentUser = auth().currentUser;
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
  },
);

// Update the slice definition
const sponsorshipSlice = createSlice({
  name: 'sponsorship',
  initialState,
  reducers: {
    clearSponsorshipState: state => {
      state.sponsorships = sponsorshipsAdapter.getInitialState();
      state.analytics = null;
      state.chatMessages = {};
      state.loading = false;
      state.error = null;
      state.sponsors = sponsorsAdapter.getInitialState();
      state.sponsorshipRequests = sponsorshipRequestsAdapter.getInitialState();
      state.groupSponsors = {};
    },
  },
  extraReducers: builder => {
    builder
      // Fetch Group Sponsorships
      .addCase(fetchGroupSponsorships.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGroupSponsorships.fulfilled, (state, action) => {
        state.loading = false;
        const entities = action.payload.map(convertToSponsorshipEntity);
        sponsorshipsAdapter.setAll(state.sponsorships, entities);
      })
      .addCase(fetchGroupSponsorships.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch sponsorships';
      })
      // Fetch Analytics
      .addCase(fetchSponsorshipAnalytics.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSponsorshipAnalytics.fulfilled, (state, action) => {
        state.loading = false;
        state.analytics = action.payload;
      })
      .addCase(fetchSponsorshipAnalytics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch analytics';
      })
      // Create Sponsorship
      .addCase(createNewSponsorship.fulfilled, (state, action) => {
        state.loading = false;
      })
      .addCase(createNewSponsorship.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to create sponsorship';
      })
      // Update Status
      .addCase(updateSponsorshipStatus.fulfilled, (state, action) => {
        const {sponsorshipId, status} = action.payload;
        const sponsorship = state.sponsorships.entities[sponsorshipId];
        if (sponsorship) {
          sponsorship.status =
            status === 'completed'
              ? 'ended'
              : status === 'terminated'
              ? 'ended'
              : status;
          if (status !== 'active') {
            sponsorship.endDate = new Date().toISOString();
          }
        }
      })
      // Fetch Chat Messages
      .addCase(fetchSponsorChatMessages.fulfilled, (state, action) => {
        const {sponsorId, sponseeId, messages} = action.payload;
        const chatId = [sponsorId, sponseeId].sort().join('_');
        state.chatMessages[chatId] = messages;
      })
      // Send Chat Message
      .addCase(sendSponsorChatMessage.fulfilled, (state, action) => {
        const {sponsorId, sponseeId, message, senderId} = action.payload;
        const chatId = [sponsorId, sponseeId].sort().join('_');
        const newMessage: SponsorChatMessage = {
          id: Date.now().toString(),
          text: message,
          senderId,
          timestamp: new Date(),
          isRead: false,
        };
        if (!state.chatMessages[chatId]) {
          state.chatMessages[chatId] = [];
        }
        state.chatMessages[chatId].push(newMessage);
      })
      // Fetch Group Sponsors
      .addCase(fetchGroupSponsors.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGroupSponsors.fulfilled, (state, action) => {
        state.loading = false;
        state.groupSponsors[action.meta.arg] = action.payload.map(
          sponsor => sponsor.id,
        );
        state.sponsors.ids = action.payload.map(sponsor => sponsor.id);
        state.sponsors.entities = action.payload.reduce<
          Record<string, SponsorEntity>
        >((acc, sponsor) => {
          acc[sponsor.id] = sponsor;
          return acc;
        }, {});
      })
      .addCase(fetchGroupSponsors.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch sponsors';
      })
      // Request Sponsorship
      .addCase(requestSponsorship.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(requestSponsorship.fulfilled, (state, action) => {
        state.loading = false;
        const {groupId, request} = action.payload;
        if (!request) return;

        if (!state.sponsorshipRequests.entities[request.id]) {
          state.sponsorshipRequests.ids.push(request.id);
          state.sponsorshipRequests.entities[request.id] = {
            id: request.id,
            sponseeId: request.sponseeId,
            sponseeName: request.sponseeName,
            message: request.message,
            status: 'pending' as const,
            createdAt: request.createdAt,
          };
        }
      })
      .addCase(requestSponsorship.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to request sponsorship';
      })
      // Accept Sponsorship Request
      .addCase(acceptSponsorshipRequest.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(acceptSponsorshipRequest.fulfilled, (state, action) => {
        state.loading = false;
        const {groupId, requestId} = action.meta.arg;
        const request = sponsorshipRequestsAdapter
          .getSelectors()
          .selectById(state.sponsorshipRequests, requestId);
        if (request) {
          sponsorshipRequestsAdapter.updateOne(state.sponsorshipRequests, {
            id: requestId,
            changes: {status: 'accepted'},
          });
        }
      })
      .addCase(acceptSponsorshipRequest.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || 'Failed to accept sponsorship request';
      })
      // Reject Sponsorship Request
      .addCase(rejectSponsorshipRequest.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(rejectSponsorshipRequest.fulfilled, (state, action) => {
        state.loading = false;
        const {groupId, requestId} = action.meta.arg;
        const request = sponsorshipRequestsAdapter
          .getSelectors()
          .selectById(state.sponsorshipRequests, requestId);
        if (request) {
          sponsorshipRequestsAdapter.updateOne(state.sponsorshipRequests, {
            id: requestId,
            changes: {status: 'rejected'},
          });
        }
      })
      .addCase(rejectSponsorshipRequest.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || 'Failed to reject sponsorship request';
      })
      // Update Sponsor Availability
      .addCase(updateSponsorAvailability.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateSponsorAvailability.fulfilled, (state, action) => {
        state.loading = false;
        const {groupId, isAvailable} = action.meta.arg;
        // Remove auth state access since it's not available in this slice
        // The UI will handle updating the sponsor's availability status
      })
      .addCase(updateSponsorAvailability.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || 'Failed to update sponsor availability';
      });
  },
});

// Optimize selectors with proper memoization
export const selectAllSponsorships = createSelector(
  [(state: RootState) => state.sponsorship.sponsorships],
  sponsorships => sponsorshipsAdapter.getSelectors().selectAll(sponsorships),
);

export const selectGroupSponsors = createSelector(
  [(state: RootState) => state.sponsorship.sponsors],
  sponsors =>
    sponsorsAdapter
      .getSelectors()
      .selectAll(sponsors)
      .filter((sponsor): sponsor is SponsorEntity => sponsor !== undefined),
);

export const selectSponsorshipRequests = createSelector(
  [(state: RootState) => state.sponsorship.sponsorshipRequests],
  requests =>
    sponsorshipRequestsAdapter
      .getSelectors()
      .selectAll(requests)
      .filter(
        (request): request is SponsorshipRequestEntity => request !== undefined,
      ),
);

export const selectSponsorSettings = (state: RootState, memberId: string) =>
  state.auth.users.entities[memberId]?.sponsorSettings;

export const selectIsSponsorAvailable = createSelector(
  [selectSponsorSettings],
  sponsorSettings => sponsorSettings?.isAvailable || false,
);

export const selectCurrentSponsees = createSelector(
  [selectAllSponsorships, (state: RootState) => state.auth.user?.uid],
  (sponsorships, userId) => {
    if (!userId) return 0;
    return sponsorships.filter(
      s => s.sponsorId === userId && s.status === 'active',
    ).length;
  },
);

export const selectActiveSponsorship = createSelector(
  [selectAllSponsorships, (state, groupId: string) => groupId],
  (sponsorships, groupId) => {
    return sponsorships.find(
      sponsorship =>
        sponsorship.groupId === groupId &&
        sponsorship.status === 'active' &&
        sponsorship.endDate === null,
    );
  },
);

export const {clearSponsorshipState} = sponsorshipSlice.actions;
export default sponsorshipSlice.reducer;
