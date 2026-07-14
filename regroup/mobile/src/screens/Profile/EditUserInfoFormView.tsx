import { FormikProps, Field } from "formik";
import { View } from "react-native";
import RatsScrollView from "../../components/rats-scroll-view";
import {
  SCROLL_CONTAINER,
  normalize,
  color,
  FILTER_CONFIRM_BUTTONS,
} from "../../styles/theme";
import React from "react";
import { Guest } from "../../entities/Guest";
import { House } from "../../entities/House";
import { User } from "../../entities/User";
import { phoneFormatter } from "../../util/formatters";
import { renderPicker } from "../../util/form";
import { getPickerItems } from "../../util/display";
import maritalStatus from "../../constants/maritalStatus";
import housingStatus from "../../constants/housingStatus";
import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import RatsDatePicker from "../../components/rats-datepicker/rats-datepicker";
import RatsImagePicker from "../../components/rats-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import ConfirmationButtons from "../../components/confirmation-buttons";
import { bottomSpace } from "../../util/platform";
import ScreenHeader from "../../components/screen-header";
import Admin from "../../entities/Admin";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

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
        formatter={fieldName === "phoneNumber" ? phoneFormatter : null}
        styleType="secondary"
        component={component}
        // placeholder={t(placeholder)}
        name={fieldName}
        disabled={isSubmitting}
        label={label}
        testID={testID}
        keyboardType={
          fieldName === "phoneNumber" || fieldName === "ssn"
            ? "phone-pad"
            : "default"
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.white }}>
      <ScreenHeader header="My Profile" renderBackButton={true} />
      <SafeAreaView
        style={{ flex: 1, paddingHorizontal: normalize(15) }}
        edges={["bottom"]}
      >
        <RatsScrollView
          contentContainerStyle={{
            ...SCROLL_CONTAINER,
            backgroundColor: color.white,
          }}
        >
          <RatsImagePicker
            onImageSelect={(response) => {
              const asset = response?.assets && response.assets[0];

              if (asset) {
                const uri = asset.uri;
                props.setFieldValue("avatar", uri);
              }
            }}
            label={props.values.avatar ? "Avatar" : "Upload Avatar"}
            avatarStyle
            onClear={() => {
              props.setFieldValue("avatar", "");
            }}
            uri={props.values.avatar}
          />
          {renderField("dateOfBirth", "date", RatsDatePicker)}
          {renderField("sobrietyDate", "date", RatsDatePicker)}
          {renderField(
            "phoneNumber",
            "(000) 000-0000",
            RatsTextInput,
            undefined,
            "phone-input",
          )}
          {renderPicker(
            "maritalStatus",
            getPickerItems(maritalStatus, undefined, false),
            "marital.status",
          )}
          {renderPicker(
            "housingStatus",
            getPickerItems(housingStatus, undefined, false),
            "housing.status",
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

export default EditUserInfoFormView;
