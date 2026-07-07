/**
 * React Query Hooks Index
 *
 * Central export point for all React Query hooks
 */

// Guest queries
export {
  guestKeys,
  useGuests,
  useGuestsBlocking,
  useGuest,
  useUpdateGuest,
  useCreateGuest,
  useDeleteGuest,
  useArchiveGuest,
} from "./guestQueries";

// House queries
export {
  houseKeys,
  useHouse,
  useHouses,
  useHousesByAdmin,
  useNearbyHouses,
  useUpdateHouse,
  useCreateHouse,
  useUpdateHouseAdmins,
} from "./houseQueries";

// Activity queries (NEW MODEL - Individual Activity documents)
export {
  useActivities,
  useInfiniteActivities,
  useHouseActivities,
  useWeekSummary,
  useLogNewActivity,
  useUpdateActivity,
  useDeleteActivity,
  useDisputeActivity,
  useResolveDispute,
  useFlushOfflineQueue,
} from "./activityQueries";

// Payment queries
export {
  paymentKeys,
  usePaymentHistory,
  useCreateRentPayment,
} from "./paymentQueries";

// Notification queries
export {
  notificationKeys,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "./notificationQueries";

// Admin queries
export {
  adminKeys,
  useHouseAdmins,
  useAdmin,
  useUpdateAdmin,
  useDeleteAdmin,
  useInviteAdmin,
} from "./adminQueries";

// Oxford House queries
export {
  oxfordKeys,
  useOfficers,
  useCreateOfficer,
  useUpdateOfficer,
  useRemoveOfficer,
  useBusinessMeetings,
  useMeetingVotes,
  useCreateBusinessMeeting,
  useUpdateBusinessMeeting,
  useElections,
  useCreateElection,
  useEESTransactions,
  useCreateEESTransaction,
  useFinancialRecords,
  useCreateFinancialRecord,
} from "./oxfordQueries";
