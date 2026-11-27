import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../state/store';
import { useMyApplications } from '../../state/queries/applicationQueries';
import RatsButton from '../../components/rats-button/rats-button';
import { Routes } from '../../navigation/types';

/**
 * "Check my application" on the landing screen (owner, 2026-11-27): an
 * applicant applies on the app's anonymous session, so this device is the
 * only way back to it. Shown only when that session has applied; it opens the
 * latest application's status. Nothing for an account that isn't anonymous.
 */
const CheckMyApplication: React.FC = () => {
  const navigation = useNavigation<any>();
  // The user from Redux re-renders this when the anonymous sign-in lands.
  const user = useAppSelector((s) => s.user.user);
  const { data: applications } = useMyApplications(!!user?.isAnonymous);
  const latest = [...(applications ?? [])].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )[0];

  if (!user?.isAnonymous || !latest) return null;

  return (
    <RatsButton
      testID="check-application-button"
      title="Check my application"
      light
      onPress={() =>
        navigation.navigate(Routes.ApplicationStatus, {
          houseId: latest.houseId,
          applicationId: latest.id,
        })
      }
    />
  );
};

export default CheckMyApplication;
