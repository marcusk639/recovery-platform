import { useCallback } from 'react';
import { Activity, ActivityType } from '../entities/ActivityModel';
import { DISPUTABLE_STATS } from '../entities/Dispute';

export interface UseActivityMetadataReturn {
  getIconForActivity: (activity: Activity) => string;
  activityIsDisputable: (activity: Activity) => boolean;
}

export function useActivityMetadata(): UseActivityMetadataReturn {
  const getIconForActivity = useCallback((activity: Activity): string => {
    const type = activity.type as string;

    if (type === 'chore_completed' || type === ActivityType.CHORE) {
      return 'broom';
    } else if (type === 'meeting_attended' || type === ActivityType.MEETING) {
      return 'users';
    } else if (
      type === 'medication_taken' ||
      type === ActivityType.MEDICATION
    ) {
      return 'pills';
    } else if (type === 'hours_worked' || type === ActivityType.WORK) {
      return 'briefcase';
    } else if (
      type === 'supporter_met' ||
      type === ActivityType.PRIMARY_SUPPORTER
    ) {
      return 'user-friends';
    } else if (type === 'chore_changed') {
      return 'exchange-alt';
    }
    return 'check-circle';
  }, []);

  const activityIsDisputable = useCallback((activity: Activity): boolean => {
    return (
      DISPUTABLE_STATS.includes(activity.type) &&
      activity.disputeResult !== 'success' &&
      activity.disputeResult !== 'fail'
    );
  }, []);

  return { getIconForActivity, activityIsDisputable };
}
