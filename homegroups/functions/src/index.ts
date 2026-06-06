// This is the main entry point for Cloud Functions for Firebase.
// It should only import and re-export functions from other files.

// Initialize Firebase Admin SDK *once* globally (usually implicitly via first import)
// We ensure it's initialized in utils/firebase.ts
import dotenv from "dotenv";

dotenv.config();

import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

// Secrets stored in Cloud Secret Manager. Firebase injects each one as
// process.env.<NAME> at function startup. Existing process.env reads in
// the codebase continue to work unchanged.
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret(
  "STRIPE_CONNECT_WEBHOOK_SECRET",
);
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const RATS_API_KEY = defineSecret("RATS_API_KEY");
const GOOGLE_MAPS_API_KEY = defineSecret("GOOGLE_MAPS_API_KEY");

setGlobalOptions({
  secrets: [
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_WEBHOOK_SECRET,
    SENDGRID_API_KEY,
    RATS_API_KEY,
    GOOGLE_MAPS_API_KEY,
  ],
});

import "./utils/firebase";

// --- Callable Functions --- (Exported for client SDKs to call)
export { findMeetings } from "./callable/findMeetings";
export { reverseGeocodeLocation } from "./callable/locationServices";
export { generateGroupInvite } from "./callable/generateGroupInvite";
export { sendGroupInviteEmail } from "./callable/sendGroupInviteEmail";
export { joinGroupByInviteCode } from "./callable/joinGroupByInviteCode";
export { sendMentionNotifications } from "./callable/sendMentionNotifications";
export { sendAnnouncementNotification } from "./callable/sendAnnouncementNotification";
export { generateTreasuryReport } from "./callable/generateTreasuryReport";
export { initiateTreasurerHandoff } from "./callable/initiateTreasurerHandoff";
export { completeTreasurerHandoff } from "./callable/completeTreasurerHandoff";
export { cancelTreasurerHandoff } from "./callable/cancelTreasurerHandoff";
export { setUserAsSuperAdmin } from "./callable/setUserAsSuperAdmin";
export { createStripeCheckoutSession } from "./callable/createStripeCheckoutSession";
export { createStripePaymentIntent } from "./callable/createStripePaymentIntent";
export { createStripeAccountLink } from "./callable/createStripeAccountLink";
export { updateGroupMemberCount } from "./callable/updateGroupMemberCount";
export { getGroupSubscriptionInfo } from "./callable/getGroupSubscriptionInfo";
export { getPublicGroupProfile } from "./callable/getPublicGroupProfile";
export { createGroupSubscription } from "./callable/createGroupSubscription";
export { setupSubscriptionPaymentMethod } from "./callable/setupSubscriptionPaymentMethod";
export { getStripeAccountInfo } from "./callable/getStripeAccountInfo";
export { getStripeAccountDetails } from "./callable/getStripeAccountDetails";
export { getStripeAccountMetrics } from "./callable/getStripeAccountMetrics";
export { searchGroupsByLocation } from "./callable/searchGroupsByLocation";
export { requestAdminAccessWithSubscription } from "./callable/requestAdminAccessWithSubscription";
export { createGroupWithSubscription } from "./callable/createGroupWithSubscription";
export { banUser } from "./callable/banUser";
export { initiateAdminRemoval } from "./callable/initiateAdminRemoval";
export { voteOnAdminRemoval } from "./callable/voteOnAdminRemoval";
export { submitAdminRemovalResponse } from "./callable/submitAdminRemovalResponse";
export { submitPartnershipLead } from "./callable/submitPartnershipLead";
export { notifyAdminRequestResult } from "./callable/notifyAdminRequestResult";
export { createCustomerPortalSession } from "./callable/createCustomerPortalSession";
export { reactivateGroupSubscription } from "./callable/reactivateGroupSubscription";
export { createWebAuthToken } from "./callable/createWebAuthToken";
export { syncUserClaims } from "./callable/syncUserClaims";
export { deleteUserAccount } from "./callable/deleteUserAccount";
export { exportUserData } from "./callable/exportUserData";
export { getGroupDashboardMetrics } from "./callable/getGroupDashboardMetrics";
export { recordCheckIn } from "./callable/recordCheckIn";
export { checkInToMeeting } from "./callable/checkInToMeeting";
export { generateReferralCode } from "./callable/generateReferralCode";
export { getReferralStats } from "./callable/getReferralStats";
export { applyReferralCode } from "./callable/applyReferralCode";
export { getMultiGroupPricing } from "./callable/getMultiGroupPricing";
export { notifyAdminUpgradeRequest } from "./callable/notifyAdminUpgradeRequest";
export { getCrossGroupSponsors } from "./callable/getCrossGroupSponsors";
export { createMultiGroupAnnouncement } from "./callable/createMultiGroupAnnouncement";
export { getPublicEvents } from "./callable/getPublicEvents";
// V3.1: Milestone tracking
export { recordMilestone } from "./callable/recordMilestone";
export { getMilestones } from "./callable/getMilestones";
// V3.2: Meeting Guide export
export { exportMeetingGuideFormat } from "./callable/exportMeetingGuideFormat";
// V3.3: Group Governance & Secretary Toolkit
export { createConscienceVote } from "./callable/createConscienceVote";
export { castConscienceVote } from "./callable/castConscienceVote";
export { closeConscienceVote } from "./callable/closeConscienceVote";
// V3.5: Step Work Companion
export { grantSponsorStepAccess } from "./callable/grantSponsorStepAccess";
// V4.1: Advanced Governance — Bylaws
export { saveBylawDraft } from "./callable/saveBylawDraft";
export { ratifyBylaws } from "./callable/ratifyBylaws";
// V4.1: Advanced Governance — Elections
export { openElection } from "./callable/openElection";
export { openElectionVoting } from "./callable/openElectionVoting";
export { nominateForElection } from "./callable/nominateForElection";
export { castElectionVote } from "./callable/castElectionVote";
export { closeElection } from "./callable/closeElection";
// V4.1: Advanced Governance — Minutes
export { saveMeetingMinutes } from "./callable/saveMeetingMinutes";
export { approveMeetingMinutes } from "./callable/approveMeetingMinutes";
// V4.1: Advanced Governance — Intergroup Report
export { generateIntergroupReport } from "./callable/generateIntergroupReport";
// V4.2: Content & Resources
export { seedDailyReflections } from "./callable/seedDailyReflections";
export { postGroupDailyThought } from "./callable/postGroupDailyThought";
export { contributeLiterature } from "./callable/contributeLiterature";
export { saveLiteratureItem } from "./callable/saveLiteratureItem";
export { bookmarkLiteratureForGroup } from "./callable/bookmarkLiteratureForGroup";
export { contributeMeetingTopic } from "./callable/contributeMeetingTopic";
export { favoriteGroupTopic } from "./callable/favoriteGroupTopic";
export { deleteGroupResource } from "./callable/deleteGroupResource";
// V4.3: Analytics
export { getAttendanceAnalytics } from "./callable/getAttendanceAnalytics";
export { getFacilityEngagementMetrics } from "./callable/getFacilityEngagementMetrics";
export { getGroupHealthTimeSeries } from "./callable/getGroupHealthTimeSeries";
export { getMemberEngagementMetrics } from "./callable/getMemberEngagementMetrics";
export { getTreasuryTrends } from "./callable/getTreasuryTrends";

// --- HTTP Request Functions --- (Exported as endpoints)
export { stripeWebhook, stripeConnectWebhook } from "./http/stripeWebhook";
export { getMeetingAttendance } from "./http/getMeetingAttendance";
export { googlePlacesProxy } from "./http/googlePlacesProxy";

// --- Firestore Trigger Functions --- (Exported for background triggers)
export {
  onGroupCreateSetGeolocation,
  // onGroupCreateFetchMeetings,
} from "./triggers/firestore/onGroupCreate";
export { onMeetingCreate } from "./triggers/firestore/onMeetingCreate";
export { onMeetingDelete } from "./triggers/firestore/onMeetingDelete";
export { updateFutureMeetingInstances } from "./triggers/firestore/onMeetingUpdate";
export { onMeetingInstanceUpdate } from "./triggers/firestore/onMeetingInstanceUpdate";
export { onGroupMemberCountUpdate } from "./triggers/firestore/onGroupMemberCountUpdate";
export { onReportCreate } from "./triggers/firestore/onReportCreate";
// onGroupAdminUpdate is intentionally disabled for two reasons:
// 1. It auto-creates Stripe subscriptions whenever an admin is added to a group — no payment
//    method is attached (payment_behavior: "default_incomplete"), so it silently fills Stripe
//    with orphaned incomplete subscriptions and bypasses the user-initiated checkout flow.
// 2. The isAdmin-sync logic (member.isAdmin = true/false) is already handled by onMemberWrite,
//    making that portion duplicative.
// If admin-sync-only behavior is ever needed, create a new trigger that does ONLY the member
// sync and omits all Stripe subscription creation.
// export { onGroupAdminUpdate } from "./triggers/firestore/onGroupAdminUpdate";

// --- Notification Trigger Functions ---
export { onAnnouncementCreate } from "./triggers/firestore/onAnnouncementCreate";
export { onMemberCreate } from "./triggers/firestore/onMemberCreate";
export { onAdminRequestCreate } from "./triggers/firestore/onAdminRequestCreate";
export { onDirectMessageCreate } from "./triggers/firestore/onDirectMessageCreate";

// --- User Data Sync Trigger Functions ---
export { onUserSponsorSettingsUpdate } from "./triggers/firestore/onUserSponsorSettingsUpdate";

// --- Role/Claims Sync Trigger Functions ---
export { onMemberWrite } from "./triggers/firestore/onMemberWrite";
export { onGroupTreasurerUpdate } from "./triggers/firestore/onGroupTreasurerUpdate";

// --- Treasury Trigger Functions ---
export { onTransactionWrite } from "./triggers/firestore/onTransactionWrite";

// --- Pub/Sub Scheduled Functions --- (Exported for scheduled execution)
export { generateDailyMeetingInstances } from "./triggers/pubsub/scheduledInstanceGenerator";
export { scheduledMilestoneCheck } from "./triggers/pubsub/scheduledMilestoneCheck";
export { scheduledAdminRequestProcessor } from "./triggers/pubsub/scheduledAdminRequestProcessor";
export { scheduledPositionReminders } from "./triggers/pubsub/scheduledPositionReminders";
export { scheduledTrialReminders } from "./triggers/pubsub/scheduledTrialReminders";
export { scheduledRenewalReminders } from "./triggers/pubsub/scheduledRenewalReminders";
export { scheduledYearEndSummary } from "./triggers/pubsub/scheduledYearEndSummary";
export { scheduledSubscriptionReconciler } from "./triggers/pubsub/scheduledSubscriptionReconciler";
export { scheduledAnnouncementPublisher } from "./triggers/scheduled/scheduledAnnouncementPublisher";
export { scheduledAdminRemovalExpiry } from "./triggers/pubsub/scheduledAdminRemovalExpiry";
export { scheduledRecurringTransactions } from "./triggers/pubsub/scheduledRecurringTransactions";
export { scheduledDailyReflection } from "./triggers/pubsub/scheduledDailyReflection";
export { scheduledMeetingReminders } from "./triggers/pubsub/scheduledMeetingReminders";
// V3.1: Milestone reminders
export { scheduledMilestoneReminders } from "./triggers/pubsub/scheduledMilestoneReminders";
// V4.1: Service Position term history trigger
export { onServicePositionWrite } from "./triggers/firestore/onServicePositionWrite";

// --- V4.4: Enterprise Features ---
// Callable functions
export { createIntergroup } from "./callable/createIntergroup";
export { upgradeIntergroupTier } from "./callable/upgradeIntergroupTier";
export { affiliateGroupToIntergroup } from "./callable/affiliateGroupToIntergroup";
export { deaffiliateGroupFromIntergroup } from "./callable/deaffiliateGroupFromIntergroup";
export { sendIntergroupAnnouncement } from "./callable/sendIntergroupAnnouncement";
export { getFacilityStats } from "./callable/getFacilityStats";
export { exportFacilityComplianceReport } from "./callable/exportFacilityComplianceReport";
export { submitBranding } from "./callable/submitBranding";
export { uploadBrandingLogo } from "./callable/uploadBrandingLogo";
export { exportGroupData } from "./callable/exportGroupData";
export { exportIntergroupData } from "./callable/exportIntergroupData";
export { configureSSO } from "./callable/configureSSO";
// Auth trigger
export { onUserCreated } from "./triggers/auth/onUserCreated";
// Firestore trigger
export { onMilestoneWrite } from "./triggers/firestore/onMilestoneWrite";
// Pub/Sub scheduled trigger
export { scheduledGroupBackups } from "./triggers/pubsub/scheduledGroupBackups";
