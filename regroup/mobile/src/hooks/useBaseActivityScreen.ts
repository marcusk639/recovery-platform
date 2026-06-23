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
import { Activity, ActivityType } from '../entities/ActivityModel';
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
import { DisputeNotification } from '../entities/Notification';
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
  overturnDispute: (dispute: Dispute) => void;
  allowDispute: (dispute: Dispute) => void;
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

  const buildNotifications = useCallback(
    (dispute: Dispute): DisputeNotification[] => {
      const guestNotification = new DisputeNotification(
        dispute,
        false,
        guest?.userId || '',
      );
      return [guestNotification];
    },
    [guest],
  );

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

      await updateDisputeMutation.mutateAsync({
        guest: activityGuest,
        house: updatedHouse,
        notifications: [],
      });
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

      const updatedGuest = cloneDeep(activityGuest);

      await updateDisputeMutation.mutateAsync({
        guest: updatedGuest,
        house: housePayload,
        notifications: buildNotifications(dispute),
      });

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
    [guests, house, disputes, user, updateDisputeMutation, buildNotifications],
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

  const overturnDispute = useCallback(
    async (dispute: Dispute): Promise<void> => {
      return Alert.alert(
        'Confirm Override',
        'Are you sure you want to override this dispute?',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: async () => {
              const activityGuest = guests[dispute.guestId];
              const { partialHouse, resolvedDispute } = updateHouseDisputes(
                dispute,
                'overturned',
              );

              const updatedGuest = cloneDeep(activityGuest);

              modal.setLoadingMessage('Processing dispute...');
              await updateDisputeMutation.mutateAsync({
                guest: updatedGuest,
                house: partialHouse,
                notifications: [],
                resolvedDispute,
              });

              try {
                await resolveDisputeInFirestore(
                  dispute.activityId,
                  user.id || '',
                  'delete',
                );
              } catch (err) {
                logException(err);
                Alert.alert(
                  'Override not saved',
                  'We could not resolve this dispute. Please try again.',
                );
              }
            },
          },
        ],
      );
    },
    [guests, user, updateHouseDisputes, updateDisputeMutation, modal],
  );

  const allowDispute = useCallback(
    async (dispute: Dispute): Promise<void> => {
      return Alert.alert(
        'Confirm Allowance',
        'Are you sure you want to allow this dispute?',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: async () => {
              const activityGuest = guests[dispute.guestId];
              const { partialHouse, resolvedDispute } = updateHouseDisputes(
                dispute,
                'allowed',
              );

              const updatedGuest = cloneDeep(activityGuest);

              modal.setLoadingMessage('Processing dispute...');
              await updateDisputeMutation.mutateAsync({
                guest: updatedGuest,
                house: partialHouse,
                notifications: [],
                resolvedDispute,
              });

              try {
                await resolveDisputeInFirestore(
                  dispute.activityId,
                  user.id || '',
                  'keep',
                );
              } catch (err) {
                logException(err);
                Alert.alert(
                  'Allowance not saved',
                  'We could not resolve this dispute. Please try again.',
                );
              }
            },
          },
        ],
      );
    },
    [guests, user, updateHouseDisputes, updateDisputeMutation, modal],
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
        testID: `resolve-dispute-button-${activity.disputeId}`,
        onPress: () => allowDispute(disputes[activity.disputeId!]),
        title: 'ALLOW',
        disabled: (activity.underDispute ?? 0) < 1,
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
        testID: `reject-dispute-button-${activity.disputeId}`,
        style: { ...STAT_BUTTON_TEXT, color: color.white },
        disabled: !isDisputable,
        containerStyle: {
          ...STAT_BUTTON,
          flex: 0.48,
          backgroundColor: color.baby_blue,
          borderColor: color.baby_blue,
        },
        onPress: () => overturnDispute(disputes[activity.disputeId!]),
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
