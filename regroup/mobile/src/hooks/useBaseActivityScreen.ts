/**
 * useBaseActivityScreen — composition hook
 *
 * Combines focused hooks (useActivityModal, useActivityFilters, useActivityMetadata)
 * with dispute business logic. Consumers can import the focused hooks directly
 * for narrower subscriptions, or use this hook for the full interface.
 */
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { Guest } from '../entities/Guest';
import { Activity, ActivityStatus, ActivityType, isLegacyUpheld } from '../entities/ActivityModel';
import { House, PartialHouseWithId } from '../entities/House';
import {
  normalize,
  color,
  STAT_BUTTON_TEXT,
  STAT_BUTTON,
  fontSize,
} from '../styles/theme';
import { getTodaysDate } from '../util/display';
import { User } from '../entities/User';
import {
  Dispute,
  DisputeChallenge,
} from '../entities/Dispute';
import { cloneDeep } from 'lodash';
import { Guests, Admins } from '../types';
import { ActivityFilterFormValues } from '../screens/Activity/ActivityFilterForm';
import { RoleToken } from '../components/auth/auth';
import Admin from '../entities/Admin';
import { useUpdateDispute } from '../state/queries/disputeQueries';
import {
  disputeActivity as disputeActivityInFirestore,
  resolveDispute as resolveDisputeInFirestore,
  verifyActivity as verifyActivityInFirestore,
} from '../services/activity';
import { logException } from '../util/logging';

import { useActivityModal } from './useActivityModal';
import { useUndoDisputeDecision } from './useUndoDisputeDecision';
import { useActivityFilters } from './useActivityFilters';
import { useActivityMetadata } from './useActivityMetadata';

interface UseBaseActivityScreenProps {
  guest?: Guest;
  house: House;
  user: User;
  guests: Guests;
  activities: Activity[];
  disputes: { [key: string]: Dispute };
  userAsAdmin?: Admin;
  admins: Admins;
}

interface UseBaseActivityScreenReturn {
  // State
  modalVisible: boolean;
  modalType: 'confirm' | 'dispute' | '';
  selectedActivity: Activity | null;
  searchTerm: string;
  filters: ActivityFilterFormValues;
  error: string;
  loadingMessage: string;

  // State setters
  setModalVisible: (visible: boolean) => void;
  setSearchTerm: (term: string) => void;
  setSearchFilters: (filters: ActivityFilterFormValues) => void;

  // Activity methods
  showModal: (type: 'confirm' | 'dispute', activity: Activity) => void;
  dismissModal: () => void;
  handleDisputeSubmission: (values: { message: string }) => Promise<boolean>;
  challengeDispute: (activity: Activity, message: string) => Promise<void>;
  disputeActivity: (activity: Activity, message: string) => Promise<void>;
  getIconForActivity: (activity: Activity) => string;
  activityIsDisputable: (activity: Activity) => boolean;

  // Dispute methods
  /** REJECT (house admins): the activity stands and counts. */
  rejectDispute: (activity: Activity) => void;
  /** APPROVE (house admins): the activity is marked not done (incomplete). */
  approveDispute: (activity: Activity) => void;
  /** UNDO DECISION (house admins): reopen a decided dispute, after a confirm. */
  undoDecision: (activity: Activity) => void;
  updateHouseDisputes: (
    dispute: Dispute,
    resolution: string,
  ) => {
    partialHouse: PartialHouseWithId;
    resolvedDispute: Dispute | undefined;
  };

  // Button props
  getLeftButtonProps: (
    activity: Activity,
    disputesOnly?: boolean,
    token?: RoleToken,
  ) => any;
  getRightButtonProps: (
    activity: Activity,
    disputesOnly?: boolean,
    token?: RoleToken,
  ) => any;

  // Filtering
  filterActivitiesByType: (
    type: ActivityType | 'all',
    disputesOnly?: boolean,
  ) => Activity[];
}

/** resolveDispute's refusals (services/activity RESOLVE_REFUSALS), as shown to the admin. */
const RESOLVE_REFUSAL_ALERTS: Record<string, { title: string; message: string }> = {
  'Not allowed to decide this dispute': {
    title: "Can't decide this dispute",
    message:
      'You cannot approve or reject a dispute on your own activity or one you logged. Another admin needs to decide it.',
  },
  'Dispute already resolved': {
    title: 'Dispute already resolved',
    message: 'Another admin has already resolved this dispute.',
  },
  'Activity is not disputed': {
    title: 'Not disputed',
    message: 'This activity is not disputed anymore, so there is nothing to resolve.',
  },
  'Activity not found': {
    title: 'Activity not found',
    message: 'This activity no longer exists.',
  },
};

export const useBaseActivityScreen = (
  props: UseBaseActivityScreenProps,
): UseBaseActivityScreenReturn => {
  const { guest, house, user, guests, activities, disputes, userAsAdmin } =
    props;

  // ─── Composed hooks ───────────────────────────────────────────────────────
  const modal = useActivityModal();
  const filtersHook = useActivityFilters(activities, guest);
  const metadata = useActivityMetadata();
  const { undoDecision } = useUndoDisputeDecision(user?.id);

  const updateDisputeMutation = useUpdateDispute();

  // ─── Dispute business logic ───────────────────────────────────────────────

  // Dispute notifications (house admins + the disputed resident) are sent by
  // the onActivityWritten Cloud Function. The client cannot create them: the
  // rules allow a notification only for the caller.

  const challengeDispute = useCallback(
    async (activity: Activity, message: string): Promise<void> => {
      const _user = guests[user.guestId] || userAsAdmin;
      const dispute = disputes[activity.disputeId!];

      const challenge: DisputeChallenge = {
        challenger: _user?.id || '',
        message,
      };

      const updatedDispute: Dispute = {
        ...dispute,
        challenges: [...(dispute.challenges || []), challenge],
      };

      const updatedHouse: PartialHouseWithId = {
        ...house,
        id: house.id,
        disputes: { ...disputes, [dispute.id]: updatedDispute },
      };

      await updateDisputeMutation.mutateAsync({ house: updatedHouse });
    },
    [guests, user, userAsAdmin, disputes, house, updateDisputeMutation],
  );

  const disputeActivity = useCallback(
    async (activity: Activity, message: string): Promise<void> => {
      // The activity write is the whole client side of a dispute. The
      // onActivityWritten Cloud Function then adds the house.disputes entry
      // and notifies the house admins and the resident; residents may write
      // neither (they could forge or wipe other people's disputes).
      try {
        await disputeActivityInFirestore(activity.id, message, user.id || '');
      } catch (err) {
        logException(err);
        Alert.alert(
          'Dispute not saved',
          'We could not record the dispute. Please try again.',
        );
        throw err;
      }
    },
    [user],
  );

  const verifyActivity = useCallback(
    async (activityId: string): Promise<void> => {
      try {
        await verifyActivityInFirestore(activityId, user.id || '');
      } catch (err) {
        logException(err);
        Alert.alert(
          'Verification failed',
          'We could not verify this activity. Please try again.',
        );
      }
    },
    [user.id],
  );

  const handleDisputeSubmission = useCallback(
    async (values: { message: string }): Promise<boolean> => {
      if (!modal.selectedActivity) return false;

      modal.setError('');
      try {
        modal.dismissModal();
        if (modal.modalType === 'confirm') {
          await challengeDispute(modal.selectedActivity, values.message);
        }
        if (modal.modalType === 'dispute') {
          await disputeActivity(modal.selectedActivity, values.message);
        }
        return true;
      } catch (error) {
        modal.setError('Something went wrong. Please try again later.');
        return false;
      }
    },
    [modal, challengeDispute, disputeActivity],
  );

  const updateHouseDisputes = useCallback(
    (
      dispute: Dispute,
      resolution: string,
    ): {
      partialHouse: PartialHouseWithId;
      resolvedDispute: Dispute | undefined;
    } => {
      const updatedDispute: Dispute = {
        ...dispute,
        status: 'resolved',
        resolutionMessage: resolution,
        resolvedDate: getTodaysDate(),
      };

      const partialHouse: PartialHouseWithId = {
        id: house.id,
        disputes: { ...disputes, [dispute.id]: updatedDispute },
      };

      const resolvedDispute = cloneDeep(partialHouse.disputes?.[dispute.id]);
      const { [dispute.id]: _removed, ...remainingDisputes } =
        partialHouse.disputes ?? {};

      return {
        partialHouse: { ...partialHouse, disputes: remainingDisputes },
        resolvedDispute,
      };
    },
    [house, disputes],
  );

  /**
   * Approve or reject the dispute on `activity` (house admins only; enforced
   * by the rules). Works from the activity itself: new-model activities carry
   * no disputeId/underDispute, so the house.disputes entry (if any) is found
   * by activityId and archived once the activity is resolved.
   */
  const resolveActivityDispute = useCallback(
    async (activity: Activity, outcome: 'approve' | 'reject'): Promise<void> => {
      modal.setLoadingMessage('Processing dispute...');
      // Only the activity is written. The onActivityWritten Cloud Function
      // removes every house.disputes entry for it and archives them.
      try {
        await resolveDisputeInFirestore(activity.id, user.id || '', outcome);
      } catch (err) {
        const refusal = RESOLVE_REFUSAL_ALERTS[(err as Error)?.message];
        if (refusal) {
          Alert.alert(refusal.title, refusal.message);
          return;
        }
        logException(err);
        Alert.alert(
          outcome === 'approve' ? 'Approval not saved' : 'Rejection not saved',
          'We could not resolve this dispute. Please try again.',
        );
      }
    },
    [user, modal],
  );

  const rejectDispute = useCallback(
    async (activity: Activity): Promise<void> => {
      return Alert.alert(
        'Reject dispute?',
        'The activity stands and keeps counting toward the weekly numbers.',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Reject',
            onPress: () => resolveActivityDispute(activity, 'reject'),
          },
        ],
      );
    },
    [resolveActivityDispute],
  );

  const approveDispute = useCallback(
    async (activity: Activity): Promise<void> => {
      return Alert.alert(
        'Approve dispute?',
        'The activity will be marked "Successfully disputed": the residents of the house report it was not completed. It stops counting and stays on record (it is never deleted).',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Approve',
            onPress: () => resolveActivityDispute(activity, 'approve'),
          },
        ],
      );
    },
    [resolveActivityDispute],
  );

  // ─── Button prop factories ────────────────────────────────────────────────

  // Owner rule: nobody disputes, decides or reopens their own activity — not
  // the resident whose activity it is (residentUid, stamped server-side, or
  // the guest doc's account) nor whoever logged it. The rules refuse it too;
  // this keeps the buttons from offering it.
  const isOwnActivity = useCallback(
    (activity: Activity): boolean =>
      !!user?.id &&
      (activity.loggedBy === user.id ||
        activity.residentUid === user.id ||
        guests[activity.guestId]?.userId === user.id),
    [user, guests],
  );


  const getLeftButtonProps = useCallback(
    (
      activity: Activity,
      disputesOnly: boolean = false,
      token?: RoleToken,
    ): any => {
      const isAdminUser =
        token &&
        (token.role[house.id] === 'admin' ||
          token.role[house.id] === 'superAdmin');
      const isPendingDispute = activity.status === ActivityStatus.DISPUTED;
      // APPROVE / REJECT: house admins (owners, managers, peer leaders) only.
      const approveButtonProps = {
        testID: `resolve-dispute-button-${activity.disputeId ?? activity.id}`,
        onPress: () => approveDispute(activity),
        title: 'APPROVE',
        disabled: activity.status !== ActivityStatus.DISPUTED,
        style: { ...STAT_BUTTON_TEXT, color: color.baby_blue },
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          borderColor: color.baby_blue,
        },
      };
      if (isAdminUser && !disputesOnly && !activity.verified) {
        return {
          testID: `verify-activity-button-${activity.id}`,
          title: 'VERIFY',
          style: { ...STAT_BUTTON_TEXT, color: color.white },
          containerStyle: {
            ...STAT_BUTTON,
            flex: 0.48,
            backgroundColor: color.green,
            borderColor: color.green,
          },
          onPress: () => verifyActivity(activity.id),
        };
      }
      if (isPendingDispute && isAdminUser && disputesOnly && !isOwnActivity(activity)) {
        return approveButtonProps;
      }
      // UNDO DECISION: a decided dispute goes back to pending, and APPROVE /
      // REJECT show again.
      if (
        (activity.status === ActivityStatus.RESOLVED || isLegacyUpheld(activity)) &&
        isAdminUser &&
        disputesOnly &&
        !isOwnActivity(activity)
      ) {
        return {
          testID: `undo-dispute-decision-button-${activity.id}`,
          onPress: () => undoDecision(activity),
          title: 'UNDO DECISION',
          style: { ...STAT_BUTTON_TEXT, color: color.baby_blue },
          containerStyle: {
            ...STAT_BUTTON,
            flex: 0.48,
            borderColor: color.baby_blue,
          },
        };
      }
      // CHALLENGE DISPUTE is hidden until the follow-up PR: it writes
      // house.disputes, which residents may no longer write, so it could only
      // fail.
    },
    [house, approveDispute, verifyActivity, isOwnActivity, undoDecision],
  );


  const activityIsDisputable = useCallback(
    (activity: Activity): boolean =>
      metadata.activityIsDisputable(activity) && !isOwnActivity(activity),
    [metadata, isOwnActivity],
  );

  const getRightButtonProps = useCallback(
    (
      activity: Activity,
      disputesOnly: boolean = false,
      token?: RoleToken,
    ): any => {
      const isDisputable = activityIsDisputable(activity);
      const rejectButtonProps = {
        testID: `reject-dispute-button-${activity.disputeId ?? activity.id}`,
        style: { ...STAT_BUTTON_TEXT, color: color.white },
        disabled: activity.status !== ActivityStatus.DISPUTED,
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          backgroundColor: color.baby_blue,
          borderColor: color.baby_blue,
        },
        onPress: () => rejectDispute(activity),
        title: 'REJECT',
      };
      const disputeButtonProps = {
        testID: `dispute-activity-button-${activity.id}`,
        style: { ...STAT_BUTTON_TEXT, color: color.red },
        disabled: !isDisputable,
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          backgroundColor: color.white,
          borderColor: color.red,
          fontSize: fontSize.regular,
        },
        onPress: () => modal.showModal('dispute', activity),
        title: 'DISPUTE',
      };
      const isAdminUser =
        token &&
        (token.role[house.id] === 'admin' ||
          token.role[house.id] === 'superAdmin');
      if (
        activity.status === ActivityStatus.DISPUTED &&
        isAdminUser &&
        disputesOnly &&
        !isOwnActivity(activity)
      ) {
        return rejectButtonProps;
      }
      // DISPUTE only on an ACTIVE activity (activityIsDisputable): never on an
      // already-disputed, resolved or deleted one.
      if (isDisputable) {
        return disputeButtonProps;
      }
    },
    [activityIsDisputable, house, rejectDispute, modal, isOwnActivity],
  );

  // ─── Return composed interface ────────────────────────────────────────────

  return {
    // From useActivityModal
    modalVisible: modal.modalVisible,
    modalType: modal.modalType,
    selectedActivity: modal.selectedActivity,
    loadingMessage: modal.loadingMessage,
    error: modal.error,
    showModal: modal.showModal,
    dismissModal: modal.dismissModal,
    setModalVisible: modal.setModalVisible,

    // From useActivityFilters
    searchTerm: filtersHook.searchTerm,
    filters: filtersHook.filters,
    setSearchTerm: filtersHook.setSearchTerm,
    setSearchFilters: filtersHook.setSearchFilters,
    filterActivitiesByType: filtersHook.filterActivitiesByType,

    // From useActivityMetadata
    getIconForActivity: metadata.getIconForActivity,
    activityIsDisputable,

    // Dispute business logic (this hook)
    handleDisputeSubmission,
    challengeDispute,
    disputeActivity,
    rejectDispute,
    approveDispute,
    undoDecision,
    updateHouseDisputes,

    // Button props (this hook)
    getLeftButtonProps,
    getRightButtonProps,
  };
};
