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
import { Activity, ActivityStatus, ActivityType } from '../entities/ActivityModel';
import { House, PartialHouseWithId } from '../entities/House';
import {
  normalize,
  color,
  STAT_BUTTON_TEXT,
  STAT_BUTTON,
  fontSize,
} from '../styles/theme';
import { getTodaysDate } from '../util/display';
import * as uuid from 'uuid';
import { User } from '../entities/User';
import {
  DISPUTABLE_STATS,
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
  /** OVERRIDE: reject the dispute; the activity stands and counts. */
  overturnDispute: (activity: Activity) => void;
  /** ALLOW: approve the dispute; the activity is marked incomplete. */
  allowDispute: (activity: Activity) => void;
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

export const useBaseActivityScreen = (
  props: UseBaseActivityScreenProps,
): UseBaseActivityScreenReturn => {
  const { guest, house, user, guests, activities, disputes, userAsAdmin } =
    props;

  // ─── Composed hooks ───────────────────────────────────────────────────────
  const modal = useActivityModal();
  const filtersHook = useActivityFilters(activities, guest);
  const metadata = useActivityMetadata();

  const updateDisputeMutation = useUpdateDispute();

  // ─── Dispute business logic ───────────────────────────────────────────────

  // Dispute notifications (house admins + the disputed resident) are sent by
  // the onActivityWritten Cloud Function. The client cannot create them: the
  // rules allow a notification only for the caller.

  const challengeDispute = useCallback(
    async (activity: Activity, message: string): Promise<void> => {
      const activityGuest = guests[activity.guestId];
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
      const activityGuest = guests[activity.guestId];
      let dispute: Dispute;

      if (activity.underDispute && activity.disputeId) {
        dispute = cloneDeep(disputes[activity.disputeId]);
      } else {
        const disputeType: ActivityType | string = DISPUTABLE_STATS.includes(
          activity.type as any,
        )
          ? activity.type
          : 'dispute';

        dispute = {
          id: uuid.v4(),
          guestId: activityGuest.id,
          houseId: house.id,
          activityId: activity.id,
          type: disputeType as any,
          message: message,
          status: 'pending',
          // M1: legacy `createdDate` write removed — Notification.tsx now reads `createdAt` with fallback.
          createdAt: getTodaysDate(),
          updatedAt: getTodaysDate(),
          challenges: [],
        };
      }

      const housePayload: PartialHouseWithId = {
        id: house.id,
        disputes: { ...disputes, [dispute.id]: dispute },
      };

      // Write the authoritative record (the activity's DISPUTED status, which
      // compliance/export reads) FIRST. Only mirror it into the denormalized
      // house.disputes cache on success — otherwise a failed activity write
      // leaves the house showing a dispute the activity never recorded, and the
      // "Dispute not saved" alert would be a lie. If the activity write fails,
      // nothing is half-applied.
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

      await updateDisputeMutation.mutateAsync({ house: housePayload });
    },
    [guests, house, disputes, user, updateDisputeMutation],
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
      // Resolve the authoritative activity record first; only update the
      // denormalized house cache if it succeeds. Otherwise the UI would show
      // the dispute resolved while the activity stays DISPUTED.
      try {
        await resolveDisputeInFirestore(activity.id, user.id || '', outcome);
      } catch (err) {
        logException(err);
        Alert.alert(
          outcome === 'approve' ? 'Allowance not saved' : 'Override not saved',
          'We could not resolve this dispute. Please try again.',
        );
        return;
      }

      const houseDispute = Object.values(disputes).find(
        d => d?.activityId === activity.id,
      );
      if (!houseDispute) return;
      const { partialHouse, resolvedDispute } = updateHouseDisputes(
        houseDispute,
        outcome === 'approve' ? 'allowed' : 'overturned',
      );
      await updateDisputeMutation.mutateAsync({
        house: partialHouse,
        resolvedDispute,
      });
    },
    [disputes, user, updateHouseDisputes, updateDisputeMutation, modal],
  );

  const overturnDispute = useCallback(
    async (activity: Activity): Promise<void> => {
      return Alert.alert(
        'Confirm Override',
        'Override this dispute? The activity stands and keeps counting.',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: () => resolveActivityDispute(activity, 'reject'),
          },
        ],
      );
    },
    [resolveActivityDispute],
  );

  const allowDispute = useCallback(
    async (activity: Activity): Promise<void> => {
      return Alert.alert(
        'Confirm Allowance',
        'Allow this dispute? The activity is marked as not done and stops counting.',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: () => resolveActivityDispute(activity, 'approve'),
          },
        ],
      );
    },
    [resolveActivityDispute],
  );

  // ─── Button prop factories ────────────────────────────────────────────────

  const getLeftButtonProps = useCallback(
    (
      activity: Activity,
      disputesOnly: boolean = false,
      token?: RoleToken,
    ): any => {
      const isDisputable = metadata.activityIsDisputable(activity);
      const isAdminUser =
        token &&
        (token.role[house.id] === 'admin' ||
          token.role[house.id] === 'superAdmin');
      const allowButtonProps = {
        testID: `resolve-dispute-button-${activity.disputeId ?? activity.id}`,
        onPress: () => allowDispute(activity),
        title: 'ALLOW',
        disabled: activity.status !== ActivityStatus.DISPUTED,
        style: { ...STAT_BUTTON_TEXT, color: color.baby_blue },
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          borderColor: color.baby_blue,
        },
      };
      const confirmButtonProps = {
        testID: `challenge-dispute-button-${activity.id}`,
        style: {
          ...STAT_BUTTON_TEXT,
          color: color.green,
          fontSize: fontSize.regular,
        },
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          borderColor: color.green,
        },
        onPress: () => modal.showModal('confirm', activity),
        title: 'CHALLENGE DISPUTE',
        disabled: !activity.underDispute,
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
      if (isDisputable) {
        if (isAdminUser) {
          return disputesOnly ? allowButtonProps : confirmButtonProps;
        }
        return confirmButtonProps;
      }
    },
    [metadata, disputes, house, allowDispute, modal, verifyActivity],
  );

  const getRightButtonProps = useCallback(
    (
      activity: Activity,
      disputesOnly: boolean = false,
      token?: RoleToken,
    ): any => {
      const isDisputable = metadata.activityIsDisputable(activity);
      const overrideButtonProps = {
        testID: `reject-dispute-button-${activity.disputeId ?? activity.id}`,
        style: { ...STAT_BUTTON_TEXT, color: color.white },
        disabled: !isDisputable,
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          backgroundColor: color.baby_blue,
          borderColor: color.baby_blue,
        },
        onPress: () => overturnDispute(activity),
        title: 'OVERRIDE',
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
      if (isDisputable) {
        if (
          token &&
          (token.role[house.id] === 'admin' ||
            token.role[house.id] === 'superAdmin')
        ) {
          return disputesOnly ? overrideButtonProps : disputeButtonProps;
        }
        return disputeButtonProps;
      }
    },
    [metadata, disputes, house, overturnDispute, modal],
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
    activityIsDisputable: metadata.activityIsDisputable,

    // Dispute business logic (this hook)
    handleDisputeSubmission,
    challengeDispute,
    disputeActivity,
    overturnDispute,
    allowDispute,
    updateHouseDisputes,

    // Button props (this hook)
    getLeftButtonProps,
    getRightButtonProps,
  };
};
