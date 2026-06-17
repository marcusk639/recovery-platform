import React from 'react';
import { View, TextStyle } from 'react-native';
import { withFormik, FormikProps } from 'formik';
import { Guest } from '../../entities/Guest';
import { Guests } from '../../types';
import { House } from '../../entities/House';
import {
  normalize,
  color,
  fontSize,
  CARD_STYLE,
  SCROLL_CONTAINER,
} from '../../styles/theme';
import { RatsText } from '../../components/rats-text';
import { UpdatableStat } from '../../components/rats-hoc/withStatUpdateModal';
import { cloneDeep } from 'lodash';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsScrollView from '../../components/rats-scroll-view';
import { useAppSelector } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests, useUpdateGuest } from '../../state/queries/guestQueries';
import { logActivity } from '../../services/activity';
import { logException } from '../../util/logging';
import {
  ActivityType,
  ActivityDataFactory,
} from '../../entities/ActivityModel';

interface ProfileUpdateFormProps {
  field: JSX.Element;
  guest: Guest;
  guests: Guests;
  house: House;
  saveGuest: (guest: Guest) => void;
  dismissModal: () => any;
  stat?: UpdatableStat;
  toggleValue?: boolean;
  loggedByUserId?: string;
}

const CONFIRMATION: TextStyle = {
  fontSize: fontSize.medium,
  marginBottom: normalize(10),
};

const ProfileUpdateFormView: React.FC<
  ProfileUpdateFormProps & FormikProps<Guest>
> = props => {
  const { handleSubmit, field, stat, dismissModal } = props;

  return (
    <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
      {field && <View style={{ ...CARD_STYLE }}>{field}</View>}
      <View
        style={{
          width: '100%',
          marginTop: 'auto',
          backgroundColor: color.white,
          justifyContent: 'center',
          padding: normalize(15),
        }}>
        {stat === 'choreCompleted' && (
          <RatsText
            translate={false}
            text="I acknowledge that I have completed this chore as instructed."
            style={CONFIRMATION}
          />
        )}
        {stat === 'metPrimarySupporter' && (
          <RatsText
            translate={false}
            text={`I acknowledge that I met with my accountability partner for at least 15 minutes.`}
            style={CONFIRMATION}
          />
        )}
        <ConfirmationButtons
          container={{ paddingBottom: 0 }}
          cancel={dismissModal}
          confirm={handleSubmit}
        />
      </View>
    </RatsScrollView>
  );
};

const ProfileUpdateFormWithFormik = withFormik<ProfileUpdateFormProps, Guest>({
  enableReinitialize: true,
  mapPropsToValues: ({ guest }) => guest,
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    setSubmitting(true);
    setStatus({});
    try {
      const { stat, dismissModal, house, toggleValue } = props;
      dismissModal();
      const updatedGuest = cloneDeep(values);

      // Handle chore change - update currentChore field
      if ((stat as string) === 'chore' && (updatedGuest as any).chore) {
        updatedGuest.currentChore = (updatedGuest as any).chore.name;
      }

      props.saveGuest(updatedGuest);

      if (props.loggedByUserId) {
        const guestId = updatedGuest.id;
        const houseId = house.id;
        const loggedBy = props.loggedByUserId;

        if (stat === 'hoursWorked' && (values as any).workHours) {
          const workHours = (values as any).workHours;
          const jobName =
            Object.keys(workHours).find(k => workHours[k] > 0) || 'Work';
          const hours = Object.values(
            workHours as Record<string, number>,
          ).reduce((sum, h) => sum + (h > 0 ? h : 0), 0);
          if (hours > 0) {
            logActivity(
              guestId,
              houseId,
              ActivityType.WORK,
              ActivityDataFactory.work(jobName, hours),
              loggedBy,
            ).catch(logException);
          }
        }

        if (stat === 'metPrimarySupporter' && toggleValue !== false) {
          const supporterName = updatedGuest.primarySupporterName || '';
          logActivity(
            guestId,
            houseId,
            ActivityType.PRIMARY_SUPPORTER,
            ActivityDataFactory.primarySupporter('', supporterName),
            loggedBy,
          ).catch(logException);
        }

        if (stat === 'choreCompleted' && toggleValue !== false) {
          const choreName = updatedGuest.currentChore || 'Chore';
          logActivity(
            guestId,
            houseId,
            ActivityType.CHORE,
            ActivityDataFactory.chore('daily', choreName),
            loggedBy,
          ).catch(logException);
        }
      }

      setStatus({ succeeded: true });
      setSubmitting(false);
    } catch (err) {
      setStatus({ failed: true });
      setSubmitting(false);
    }
  },
})(ProfileUpdateFormView);

/**
 * Profile Update Form Wrapper
 *
 * Injects Redux state into the Formik form for updating guest profiles.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (import * as actions from guests)
 * - Added RTK import: updateSelectedGuest from guestsSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 3 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (.unwrap() for error handling)
 */
const ProfileUpdateForm: React.FC<
  Omit<ProfileUpdateFormProps, 'guest' | 'guests' | 'house' | 'loggedByUserId'>
> = props => {
  const { mutateAsync: updateGuestAsync } = useUpdateGuest();
  const { guest } = useSelectedGuest();
  const { house } = useSelectedHouse();
  const user = useAppSelector(state => state.user.user);
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');

  // Type guard for required state
  if (!guest || !house) {
    return null;
  }

  return (
    <ProfileUpdateFormWithFormik
      {...props}
      guest={guest}
      guests={guests}
      house={house}
      loggedByUserId={user?.id}
      saveGuest={(updatedGuest: Guest) => {
        // Persist edits to Firestore via the safe transactional merge. The
        // previous Redux-only dispatch never reached the database (P0-5).
        updateGuestAsync({ guest, updatedGuest }).catch(logException);
      }}
    />
  );
};

export default ProfileUpdateForm;
