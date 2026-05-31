import React, { Fragment } from 'react';
import { FormikProps, withFormik } from 'formik';
import { View } from 'react-native';
import { normalize, CARD_STYLE, color } from '../../styles/theme';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsScrollView from '../../components/rats-scroll-view';
import { IOS } from '../../util/platform';

export interface MiscellaneousFormProps {
  dismissModal: () => void;
  onSubmit: (values: any) => Promise<void>;
  header: string;
}

const MiscellaneousForm = (
  initialValues: { [fieldName: string]: string },
  fields: any,
  outerProps: MiscellaneousFormProps,
  cleanForm: any,
) => {
  const MiscellaneousFormView = (
    props: FormikProps<any> & MiscellaneousFormProps,
  ) => {
    return (
      // <View style={{ flex: 1 }}>
      <RatsScrollView
        behavior={IOS ? 'padding' : null}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[CARD_STYLE]}>{fields}</View>

        <View
          style={{
            width: '100%',
            marginTop: 'auto',
            backgroundColor: color.white,
            padding: normalize(15),
          }}>
          <ConfirmationButtons
            confirm={props.handleSubmit}
            cancel={outerProps.dismissModal}
            confirmButtonText="SAVE"
          />
        </View>
      </RatsScrollView>
      // </View>
    );
  };

  return withFormik<any, any>({
    // mapPropsToValues: props => ({ type: props.filters.type, guest: props.filters.guest, disputed: props.filters.disputed }),
    mapPropsToValues: props => initialValues,
    handleSubmit: async (values, formikBag) => {
      const { onSubmit, dismissModal } = outerProps;
      onSubmit(values);
      dismissModal();
    },
    validationSchema: null,
    //@ts-ignore
  })(MiscellaneousFormView);
};

export default MiscellaneousForm;
