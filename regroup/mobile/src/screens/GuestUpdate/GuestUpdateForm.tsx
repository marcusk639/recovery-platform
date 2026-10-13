import React, { useCallback } from 'react';
import { withFormik } from 'formik';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests, useUpdateGuest } from '../../state/queries/guestQueries';
import GuestUpdateFormView from './GuestUpdateFormView';
import { Guest } from '../../entities/Guest';
import {
  GuestFormValues,
  guestMoneyUpdate,
  guestToFormValues,
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
  // Formik's own channel. `status` is rendered nowhere in this app — all three
  // pre-existing setStatus calls on this form were already going nowhere — but
  // `errors[field]` is rendered inline with a red border by RatsTextInput,
  // which this form already uses for these fields. Returning a non-empty
  // object here also stops Formik calling handleSubmit at all.
  //
  // withFormik wires this as validate(values, props) — see formik 2.4.9
  // formik.cjs.development.js:1471 — and SUBMIT_ATTEMPT marks every field
  // touched, which is the gate RatsTextInput:423 needs before it renders.
  validate: (values: GuestFormValues, props: GuestUpdateProps) => {
    const result = guestMoneyUpdate(props.guest, values);
    if (result.ok) {
      return {};
    }
    const errors: Record<string, string> = {};
    for (const field of result.malformedFields) {
      errors[field as string] = 'Enter an amount like 1234.56';
    }
    return errors;
  },
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    setStatus({});
    setSubmitting(true);
    try {
      const result = guestMoneyUpdate(props.guest, values);
      // Defence in depth, deliberately redundant with validate above. It is
      // load-bearing if anyone later sets validateOnChange: false, adds a
      // validationSchema that deep-merges over this result, or reaches
      // submitForm down a path that skips validation. It is also what narrows
      // the type — result.payload does not exist on the ok: false arm — so it
      // cannot be deleted without a compile error. See Step 8.
      if (!result.ok) {
        setSubmitting(false);
        return;
      }
      await props.updateGuest(result.payload, result.authoritativeFields);
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
