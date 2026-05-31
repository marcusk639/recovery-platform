import { withFormik, FormikProps, Field } from 'formik';
import { User } from '../../entities/User';
import { View } from 'react-native';
import RatsScrollView from '../../components/rats-scroll-view';
import {
  SCROLL_CONTAINER,
  normalize,
  color,
  FILTER_CONFIRM_BUTTONS,
} from '../../styles/theme';
import React from 'react';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { updateUser } from '../../state/slices/userSlice';
import { useUpdateGuest } from '../../state/queries/guestQueries';
import { useUpdateAdmin } from '../../state/queries/adminQueries';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { phoneFormatter } from '../../util/formatters';
import { renderPicker } from '../../util/form';
import { getPickerItems } from '../../util/display';
import maritalStatus from '../../constants/maritalStatus';
import housingStatus from '../../constants/housingStatus';
import ethnicity from '../../constants/ethnicity';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import RatsDatePicker from '../../components/rats-datepicker/rats-datepicker';
import RatsImagePicker from '../../components/rats-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConfirmationButtons from '../../components/confirmation-buttons';
import { bottomSpace } from '../../util/platform';
import ScreenHeader from '../../components/screen-header';
import Admin from '../../entities/Admin';
import cloneDeep from 'lodash/cloneDeep';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type EditUserInfoValues = Partial<User>;

export interface EditUserInfoProps {
  guest: Guest;
  user: User;
  house: House;
  admin: Admin;
  updateUser: (user: User, values: Partial<User>) => any;
  updateGuest?: (guest: Guest, updates: Partial<Guest>) => any;
  updateAdmin?: (admin: Admin, updates: Partial<Admin>) => any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const EditUserInfoFormView = (props: EditUserInfoProps & FormikProps<User>) => {
  function renderField(
    fieldName: string,
    placeholder: string,
    component: React.ComponentType<any>,
    label?: string,
    testID?: string,
  ) {
    const { isSubmitting } = props;
    return (
      <Field
        formatter={fieldName === 'phoneNumber' ? phoneFormatter : null}
        styleType="secondary"
        component={component}
        // placeholder={t(placeholder)}
        name={fieldName}
        disabled={isSubmitting}
        label={label}
        testID={testID}
        keyboardType={
          fieldName === 'phoneNumber' || fieldName === 'ssn'
            ? 'phone-pad'
            : 'default'
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.white }}>
      <ScreenHeader header="My Profile" renderBackButton={true} />
      <SafeAreaView
        style={{ flex: 1, paddingHorizontal: normalize(15) }}
        edges={['bottom']}>
        <RatsScrollView
          contentContainerStyle={{
            ...SCROLL_CONTAINER,
            backgroundColor: color.white,
          }}>
          <RatsImagePicker
            onImageSelect={response => {
              const asset = response?.assets && response.assets[0];

              if (asset) {
                const uri = asset.uri;
                props.setFieldValue('avatar', uri);
              }
            }}
            label={props.values.avatar ? 'Avatar' : 'Upload Avatar'}
            avatarStyle
            onClear={() => {
              props.setFieldValue('avatar', '');
            }}
            uri={props.values.avatar}
          />
          {renderField('dateOfBirth', 'date', RatsDatePicker)}
          {renderField('sobrietyDate', 'date', RatsDatePicker)}
          {renderField(
            'phoneNumber',
            '(000) 000-0000',
            RatsTextInput,
            undefined,
            'phone-input',
          )}
          {renderPicker(
            'maritalStatus',
            getPickerItems(maritalStatus, undefined, false),
            'marital.status',
          )}
          {renderPicker(
            'housingStatus',
            getPickerItems(housingStatus, undefined, false),
            'housing.status',
          )}
          {/* {renderPicker('ethnicity', getPickerItems(ethnicity, undefined, false), 'ethnicity')} */}
        </RatsScrollView>
        <ConfirmationButtons
          container={{
            ...FILTER_CONFIRM_BUTTONS,
            paddingBottom: bottomSpace > 0 ? 0 : normalize(15),
            paddingHorizontal: 0,
          }}
          confirm={props.handleSubmit}
          cancel={() => props.navigation.goBack()}
          confirmButtonText="APPLY"
          confirmTestID="save-profile-button"
        />
      </SafeAreaView>
    </View>
  );
};

const stats: string[] = [
  'dateOfBirth',
  'avatar',
  'phoneNumber',
  'maritalStatus',
  'housingStatus',
  'ethnicity',
  'sobrietyDate',
];

const EditUserInfoForm = withFormik<EditUserInfoProps, EditUserInfoValues>({
  mapPropsToValues: (props: EditUserInfoProps) => {
    const values: Partial<User> = {};
    stats.forEach(
      stat =>
        ((values as Record<string, any>)[stat] = (
          props.user as Record<string, any>
        )[stat]),
    );
    return values;
  },
  handleSubmit: async (values: Partial<User>, formikBag) => {
    const {
      guest,
      user,
      admin,
      updateUser,
      updateGuest,
      updateAdmin,
      navigation,
    } = formikBag.props;

    // Update user with new values
    await updateUser(user, values);

    // Update guest if exists
    if (guest && updateGuest) {
      const guestUpdates: Partial<Guest> = {};
      stats.forEach(
        stat =>
          ((guestUpdates as Record<string, any>)[stat] = (
            values as Record<string, any>
          )[stat]),
      );
      await updateGuest(guest, guestUpdates);
    }

    // Update admin if exists
    if (admin && updateAdmin) {
      const adminUpdates: Partial<Admin> = {};
      stats.forEach(
        stat =>
          ((adminUpdates as Record<string, any>)[stat] = (
            values as Record<string, any>
          )[stat]),
      );
      await updateAdmin(admin, adminUpdates);
    }

    navigation.goBack();
  },
  validationSchema: null,
  //@ts-ignore
})(EditUserInfoFormView);

/**
 * Edit User Info Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (userActions, guestActions)
 * - Added RTK import: updateOptionalInfo from userSlice
 * - Updated Props interface to use generic function types
 * - Updated 2 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (removed 'as any' cast)
 */
const EditUserInfoFormWrapper: React.FC<any> = props => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const guest = useAppSelector(state => state.guests.userAsGuest);
  const { house } = useSelectedHouse();
  const admin = useAppSelector(state => state.admin.userAsAdmin);
  const { mutateAsync: updateGuestMutation } = useUpdateGuest();
  const { mutateAsync: updateAdminMutation } = useUpdateAdmin();

  return (
    <EditUserInfoForm
      {...props}
      user={user}
      guest={guest}
      house={house}
      admin={admin}
      updateUser={(user: User, values: Partial<User>) =>
        dispatch(updateUser({ user, updates: values }))
      }
      updateGuest={
        guest
          ? (guestArg: Guest, updates: Partial<Guest>) =>
              updateGuestMutation({
                guest: guestArg,
                updatedGuest: { ...guestArg, ...updates },
              })
          : undefined
      }
      updateAdmin={
        admin
          ? (adminArg: Admin, updates: Partial<Admin>) =>
              updateAdminMutation({ adminId: adminArg.id, updates })
          : undefined
      }
    />
  );
};

export default EditUserInfoFormWrapper;
