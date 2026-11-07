import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from '@react-native-firebase/firestore';
import { firestore } from '../../../firebase-setup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OfficerRole } from '../../entities/oxford/Officer';
import { houseKeys } from '../queries/houseQueries';

interface OnboardingOfficer {
  role: OfficerRole;
  name: string;
}

export interface OxfordOnboardingPayload {
  houseId: string;
  officers: OnboardingOfficer[];
  firstMeeting: { scheduledDate: string };
  eesMonthlyAmount: number;
}

async function completeOxfordOnboarding(
  payload: OxfordOnboardingPayload,
): Promise<void> {
  const { houseId, officers, firstMeeting, eesMonthlyAmount } = payload;
  const batch = writeBatch(firestore);

  // All Oxford data lives under houses/{houseId}/... subcollections — the
  // Firestore security rules at firebase/firestore.rules only protect these
  // subcollection paths. Writing to flat top-level collections (the prior
  // implementation) is rejected by rules and the data is invisible to every
  // read path in src/services/oxford/. See .full-review/01-quality-architecture.md [A1].
  const houseRef = doc(collection(firestore, 'houses'), houseId);

  officers.forEach(officer => {
    // Deterministic doc ID (the role) makes onboarding idempotent — re-running
    // overwrites the same officer doc rather than creating a duplicate. Safe
    // because each house has exactly one officer per role.
    const ref = doc(collection(houseRef, 'officers'), officer.role);
    batch.set(ref, {
      role: officer.role,
      name: officer.name,
      houseId,
      isActive: true,
      createdAt: serverTimestamp(),
    });
  });

  // Deterministic ID 'onboarding' so re-running onboarding overwrites the
  // same meeting doc rather than creating duplicates.
  const meetingRef = doc(collection(houseRef, 'business-meetings'), 'onboarding');
  batch.set(meetingRef, {
    houseId,
    scheduledDate: firstMeeting.scheduledDate,
    agenda: [],
    attendees: [],
    quorumMet: false,
    createdBy: 'onboarding',
    createdAt: serverTimestamp(),
  });

  batch.update(houseRef, {
    eesMonthlyAmount,
    oxfordOnboardingComplete: true,
  });

  await batch.commit();
}

export function useCompleteOxfordOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeOxfordOnboarding,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: houseKeys.details() });
      queryClient.invalidateQueries({
        queryKey: ['officers', variables.houseId],
      });
      queryClient.invalidateQueries({
        queryKey: ['business-meetings', variables.houseId],
      });
    },
  });
}
