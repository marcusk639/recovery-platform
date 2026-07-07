import React from "react";
import { withFormik } from "formik";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { useGuests } from "../../state/queries/guestQueries";
import { addGuest } from "../../state/slices/guestsSlice";
// import CreateGuestFormView from './CreateGuestFormView';
import GuestUpdateFormView from "../GuestUpdate/GuestUpdateFormView";
import { guestSchema, Guest } from "../../entities/Guest";
import { GuestUpdateProps } from "../GuestUpdate/GuestUpdateForm";

interface CreateGuestFormProps extends GuestUpdateProps {
  houseId: string | null;
}

const CreateGuestForm = withFormik<CreateGuestFormProps, Guest>({
  enableReinitialize: true,
  mapPropsToValues: ({ guest }) => guest,
  handleSubmit: async (
    values,
    { props, setStatus, setSubmitting, resetForm },
  ) => {
    setStatus({});
    setSubmitting(true);
    if (!props.houseId) {
      setStatus({ failed: true });
      setSubmitting(false);
      return;
    }
    try {
      values.houseId = props.houseId;
      await props.addGuest(values, props.guests);
      setStatus({ succeeded: true });
      setSubmitting(false);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      resetForm(new Guest());
    } catch (err) {
      // console.log(err);
      setStatus({ failed: true });
      setSubmitting(false);
    }
  },
  validationSchema: guestSchema,
})(GuestUpdateFormView);

/**
 * Create Guest Form Wrapper
 *
 * Wrapper component to inject RTK state into Formik form.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (import * as actions)
 * - Added RTK import: addGuest from guestsSlice
 * - Updated selector to use state.guests (removed 'as any' cast)
 * - Removed spread of old actions, now passes RTK thunks directly
 */
const CreateGuestFormWrapper: React.FC<any> = (props) => {
  // React Query is the source of truth for guests; see .full-review [A2].
  const { house, houseId } = useSelectedHouse();
  const { data: guests = {} } = useGuests(house?.id ?? "");

  return (
    <CreateGuestForm
      {...props}
      guests={guests}
      addGuest={addGuest}
      houseId={houseId}
    />
  );
};

export default CreateGuestFormWrapper;
