import React, { useCallback } from 'react';
import { withFormik } from 'formik';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests, useUpdateGuest } from '../../state/queries/guestQueries';
import GuestUpdateFormView from './GuestUpdateFormView';
import { Guest } from '../../entities/Guest';
import { Guests } from '../../types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

export interface GuestUpdateProps {
  guest: Guest;
  guests: Guests;
  updateGuest: (guest: Guest, clearCache?: boolean) => any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GuestUpdateForm = withFormik<GuestUpdateProps, Guest>({
  enableReinitialize: true,
  mapPropsToValues: ({ guest }) => guest,
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    setStatus({});
    setSubmitting(true);
    try {
      const updatedGuest = { ...props.guest, ...values };
      await props.updateGuest(updatedGuest, true);
      setStatus({ succeeded: true });
      setSubmitting(false);
    } catch (err) {
      setStatus({ failed: true });
      setSubmitting(false);
    }
  },
  // validationSchema: guestSchema
})(GuestUpdateFormView);

/**
 * Guest Update Form Wrapper
 *
 * Wires the useUpdateGuest React Query mutation into the Formik form.
 * Previously this file imported `updateGuest`/`addGuest` from guestsSlice —
 * those exports no longer exist (removed in Phase C thunk cleanup), which
 * meant props.updateGuest was undefined at runtime and the form crashed on
 * submit. The RQ mutation is the canonical write path and handles cache
 * invalidation + optimistic updates internally.
 */
const GuestUpdateFormWrapper: React.FC<any> = props => {
  const { guest } = useSelectedGuest();
  // React Query is the source of truth for guests; see .full-review [A2].
  // Scope the fetch to the guest's house — there's no separate house selector
  // available in this wrapper.
  const { data: guests = {} } = useGuests(guest?.houseId ?? '');
  const { mutateAsync: updateGuestMutation } = useUpdateGuest();

  const updateGuest = useCallback(
    async (updatedGuest: Guest) => {
      // The mutation expects a { guest, updatedGuest } pair — guest is the
      // pre-update snapshot used for rollback in onError.
      if (!guest) return;
      return updateGuestMutation({ guest, updatedGuest });
    },
    [guest, updateGuestMutation],
  );

  return (
    <GuestUpdateForm
      {...props}
      guest={guest}
      guests={guests}
      updateGuest={updateGuest}
    />
  );
};

export default GuestUpdateFormWrapper;
