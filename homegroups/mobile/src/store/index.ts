import {configureStore} from '@reduxjs/toolkit';
import {TypedUseSelectorHook, useDispatch, useSelector} from 'react-redux';
import authReducer from './slices/authSlice';
import groupsReducer from './slices/groupsSlice';
import transactionsReducer from './slices/transactionsSlice';
import treasuryReducer from './slices/treasurySlice';
import meetingsReducer from './slices/meetingsSlice';
import announcementsReducer from './slices/announcementsSlice';
import membersReducer from './slices/membersSlice';
import chatReducer from './slices/chatSlice';
import servicePositionsReducer from './slices/servicePositionsSlice';
import sponsorshipReducer from './slices/sponsorshipSlice';
import reportsReducer from './slices/reportsSlice';
import treasurerHandoffReducer from './slices/treasurerHandoffSlice';
import businessMeetingsReducer from './slices/businessMeetingsSlice';
import directMessagesReducer from './slices/directMessagesSlice';
import dashboardReducer from './slices/dashboardSlice';
import adminRemovalReducer from './slices/adminRemovalSlice';
import recurringTransactionsReducer from './slices/recurringTransactionsSlice';
import engagementReducer from './slices/engagementSlice';
import referralReducer from './slices/referralSlice';
import stepWorkReducer from './slices/stepWorkSlice';
import reflectionsReducer from './slices/reflectionsSlice';
import literatureReducer from './slices/literatureSlice';
import groupResourcesReducer from './slices/groupResourcesSlice';
import groupHealthReducer from './slices/groupHealthSlice';
import {RootState} from './types';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    groups: groupsReducer,
    transactions: transactionsReducer,
    treasury: treasuryReducer,
    meetings: meetingsReducer,
    announcements: announcementsReducer,
    members: membersReducer,
    chat: chatReducer,
    servicePositions: servicePositionsReducer,
    sponsorship: sponsorshipReducer,
    reports: reportsReducer,
    treasurerHandoff: treasurerHandoffReducer,
    businessMeetings: businessMeetingsReducer,
    directMessages: directMessagesReducer,
    dashboard: dashboardReducer,
    adminRemoval: adminRemovalReducer,
    recurringTransactions: recurringTransactionsReducer,
    engagement: engagementReducer,
    referral: referralReducer,
    stepWork: stepWorkReducer,
    reflections: reflectionsReducer,
    literature: literatureReducer,
    groupResources: groupResourcesReducer,
    groupHealth: groupHealthReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false, // To allow Firebase objects in the store
    }),
});

// Export types for TypeScript
export type AppDispatch = typeof store.dispatch;

// Hooks for typed dispatch and selector
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
