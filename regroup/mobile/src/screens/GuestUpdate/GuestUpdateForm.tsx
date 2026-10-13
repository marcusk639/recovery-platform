import React, { useCallback } from 'react';
import { withFormik } from 'formik';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests, useUpdateGuest } from '../../state/queries/guestQueries';
import GuestUpdateFormView from './GuestUpdateFormView';
import { Guest } from '../../entities/Guest';
import {
  GuestFormValues,
  changedMoneyFields,
  formValuesToGuest,
  guestToFormValues,
  malformedMoneyFields,
} from './guestFormValues';
import { Guests } from '../../types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

export interface GuestUpdateProps {
  guest: Guest;
  guests: Guests;
  updateGuest: (
    guest: Partial<Guest>,
    authoritativeFields?: ReadonlyArray<keyof Guest>,
  ) => any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const GuestUpdateForm = withFormik<GuestUpdateProps, GuestFormValues>({
  enableReinitialize: true,
  // rentOwed/choreFees are stored in cents but edited in dollars — see
  // guestFormValues.ts. Passing the guest through unconverted is what made an
  // operator typing "500" set a $5.00 balance.
  mapPropsToValues: ({ guest }) => guestToFormValues(guest),
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    setStatus({});
    // Unreadable money is refused, not silently discarded. Without this the
    // field parses back to the stored value, counts as unchanged, is omitted
    // from the payload, and the operator is told the save succeeded.
    const malformed = malformedMoneyFields(values);
    if (malformed.length > 0) {
      setStatus({ failed: true, malformedFields: malformed });
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      const updatedGuest = formValuesToGuest(props.guest, values);
      // Only the money fields the operator actually edited are authoritative.
      // Declaring an untouched field authoritative would let a stale form value
      // beat a concurrent server-side decrement (a resident's Stripe payment).
      const authoritativeFields = changedMoneyFields(props.guest, values);
      await props.updateGuest(updatedGuest, authoritativeFields);
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
    async (
      updatedGuest: Partial<Guest>,
      authoritativeFields?: ReadonlyArray<keyof Guest>,
    ) => {
      // The mutation expects a { guest, updatedGuest } pair — guest is the
      // pre-update snapshot used for rollback in onError.
      if (!guest) return;
      // The operator editing this form is authoritative over the money fields,
      // so they are exempted from the accumulator max-merge in mergeGuestStats.
      // Without this an edit that LOWERS a balance (cash payment, write-off,
      // correction, or zeroing a paid-off resident) is silently discarded while
      // the form reports success.
      return updateGuestMutation({
        guest,
        updatedGuest,
        authoritativeFields,
      });
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
