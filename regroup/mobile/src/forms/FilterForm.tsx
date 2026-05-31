import React from 'react';
import { FormikProps, withFormik } from 'formik';
import {
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import ScreenHeader from '../components/screen-header';
import { RatsText } from '../components/rats-text';
import ConfirmationButtons from '../components/confirmation-buttons';
import { CARD_NO_ELEVATION, normalize, color } from '../styles/theme';
import {
  FILTER_CONFIRM_BUTTONS,
  FILTER_HEADER,
  CLEAR_FILTER,
} from '../styles/theme';
import { IOS, bottomSpace } from '../util/platform';
import { SafeAreaView } from 'react-native-safe-area-context';
import RatsScrollView from '../components/rats-scroll-view';
import { ScrollView } from 'react-native-gesture-handler';
import RatsButton from '../components/rats-button/rats-button';

export interface FilterFormProps {
  dismissModal: () => void;
  setSearchFilters: (filters: any) => void;
  filters: any;
}

const FilterForm = (
  initialValues: any,
  fields: any,
  outerProps: FilterFormProps,
  cleanForm: any,
  onReset?: () => void
) => {
  const FilterFormView = (props: FormikProps<any> & FilterFormProps) => {
    return (
      <RatsScrollView
        enableAutomaticScroll={IOS ? false : true}
        behavior="padding"
        extraScrollHeight={IOS ? 0 : normalize(150)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          ...CARD_NO_ELEVATION,
          flexGrow: 1,
          backgroundColor: color.white,
        }}
        scrollEnabled
        enableOnAndroid>
        <ScreenHeader
          headerStyle={{ paddingBottom: IOS ? normalize(30) : undefined }}
          container={FILTER_HEADER}
          header="Filter By">
          <TouchableOpacity
            style={{ justifyContent: 'center' }}
            onPress={() => {
              props.resetForm(cleanForm);
              if (onReset) {
                onReset();
              }
            }}>
            <RatsText text="CLEAR ALL" translate={false} style={CLEAR_FILTER} />
          </TouchableOpacity>
        </ScreenHeader>
        <View
          style={{
            marginBottom: 1,
            paddingHorizontal: IOS ? normalize(10) : 0,
          }}>
          {fields}
        </View>
        {/* {fields} */}
        {/* {this.renderField('dateOfBirth', 'date', RatsDatePicker)} */}
        <ConfirmationButtons
          container={{
            ...FILTER_CONFIRM_BUTTONS,
            paddingBottom: bottomSpace > 0 ? 0 : normalize(15),
            paddingHorizontal: 0,
          }}
          confirm={props.handleSubmit}
          cancel={outerProps.dismissModal}
          confirmButtonText="APPLY"
        />
        <SafeAreaView
          edges={['bottom']}
          style={{ backgroundColor: color.white }}
        />
      </RatsScrollView>
    );
  };

  return withFormik<any, any>({
    enableReinitialize: true,
    // mapPropsToValues: props => ({ type: props.filters.type, guest: props.filters.guest, disputed: props.filters.disputed }),
    mapPropsToValues: props => initialValues,
    handleSubmit: async (values, formikBag) => {
      const { setSearchFilters, dismissModal } = outerProps;
      setSearchFilters(values);
      dismissModal();
    },
    validationSchema: null,
    //@ts-ignore
  })(FilterFormView);
};

export default FilterForm;
