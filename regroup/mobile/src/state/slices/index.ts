/**
 * Redux Toolkit Slices Index
 *
 * Central export point for all RTK slices and actions
 */

// Auth Slice
export {
  default as authReducer,
  loginStart,
  loginSuccess,
  loginFailure,
  logoutStart,
  logoutSuccess,
  updateUser,
  setInvitation,
  setToken,
  clearAuthError,
} from "./authSlice";

// Theme Slice
export { default as themeReducer } from "./themeSlice";

// User Slice
export {
  default as userReducer,
  login,
  anonymouslyLogin,
  autoLogin,
  logout,
  updateUser as updateUserRTK,
  createUser,
  requestAccountVerification,
  loginFailedAction,
  initializeInvitation,
  setSignUpRole,
  setSubscriptionStatus,
  clearError as clearUserError,
  resetUserState,
} from "./userSlice";

// Houses Slice
export {
  default as housesReducer,
  selectHouse,
  selectHouseById,
  clearHouseError,
  resetSearchResults,
} from "./housesSlice";

// Guests Slice
export {
  default as guestsReducer,
  selectGuest,
  selectGuestById,
  updateSelectedGuest,
  cacheGuests,
  cacheGuest,
  clearGuestError,
} from "./guestsSlice";

// Meetings Slice
export {
  default as meetingsReducer,
  searchForMeetings,
  checkIntoMeeting,
  addMeeting,
  updateMeeting as updateMeetingRTK,
  deleteMeeting,
  clearMeetingError,
  resetCheckInStatus,
  clearMeetings,
} from "./meetingsSlice";

// Admin Slice
export {
  default as adminReducer,
  setUserAsAdmin,
  selectAdmin,
  clearSelectedAdmin,
  clearError as clearAdminError,
  resetAdminState,
  selectAllAdmins,
  selectAdminById,
  selectUserAsAdmin,
  selectSelectedAdmin,
  selectHouseAdmins,
  selectAdminLoading,
  selectAdminError,
} from "./adminSlice";

// Chat Slice
export {
  default as chatReducer,
  loadConversation,
  sendDirectMessage,
  markMessagesAsRead,
  setActiveConversation,
  setRecipient,
  clearRecipient,
  addMessageToConversation,
  updateMessageInConversation,
  clearConversation,
  clearAllConversations,
  resetMessageSent,
  clearError as clearChatError,
  resetChatState,
  selectConversation,
  selectActiveConversation,
  selectActiveConversationId,
  selectRecipient,
  selectSendingMessage,
  selectMessageSent,
  selectChatLoading,
  selectChatError,
} from "./chatSlice";

// Setup Slice
export {
  default as setupReducer,
  createOrganization,
  createHouse as createHouseSetup,
  updateHouseConfig,
  completeSetup,
  setCurrentStep,
  nextStep,
  previousStep,
  setOrganization,
  setSelectedHouse,
  updateHouseData,
  setSelectedPhase,
  setSelectedChore,
  setGuests,
  setAdmins,
  setInApp,
  startHouseSetup,
  resetSubmissionState,
  clearError as clearSetupError,
  resetSetupState,
  selectCurrentStep,
  selectOrganization,
  selectSelectedHouse as selectSetupHouse,
  selectHouses as selectSetupHouses,
  selectSelectedPhase,
  selectSelectedChore,
  selectSetupGuests,
  selectSetupAdmins,
  selectInApp,
  selectSubmitting,
  selectSubmittingSuccessful,
  selectSubmittingFailed,
  selectSetupError,
} from "./setupSlice";

// Notifications Slice
export {
  default as notificationsReducer,
  setFcmToken,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
  clearError as clearNotificationsError,
  resetNotificationsState,
  selectAllNotifications,
  selectUnreadNotifications,
  selectUnreadCount,
  selectFcmToken,
  selectNotificationsLoading,
  selectNotificationsError,
} from "./notificationsSlice";
