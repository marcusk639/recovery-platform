import React from 'react';
import { Field, FormikProps } from 'formik';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { View, TouchableOpacity, Text, Linking } from 'react-native';
import { useCallback } from 'react';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import styles from './SignUpStyles';
import RatsButton from '../../components/rats-button/rats-button';
import RatsCheckBox from '../../components/rats-checkbox/rats-checkbox';
import { RatsText } from '../../components/rats-text';
import { SignUpFormProps, SignUpFormValues } from './SignUpForm';
import { loginTextInputStyle } from '../Login/LoginStyles';

import { IOS } from '../../util/platform';
import { RatsSwitch } from '../../components/rats-switch';
import { normalize, color, fontSize, ROW } from '../../styles/theme';
import { RatsIcon } from '../../components/rats-icon';
import { Routes } from '../../navigation/types';
import { fontFamily } from '../../styles/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppSelector } from '../../state/hooks';

const SignUpFormView: React.FC<
  SignUpFormProps & FormikProps<SignUpFormValues>
> = props => {
  const {
    isSubmitting,
    handleSubmit,
    error,
    navigation,
    values,
    errors,
    touched,
    submitCount,
    isValid,
  } = props;

  const invitation = useAppSelector(state => state.user.invitation);
  const signUpRole = useAppSelector(state => state.user.signUpRole);

  const requirementStyle = useCallback(
    (requirement: string) => {
      const base = {
        fontSize: fontSize.regular,
        marginVertical: normalize(3),
        fontWeight: '500' as const,
      };
      if (meetsRequirement(requirement)) {
        return { color: color.green, ...base };
      }
      return { color: color.dark_grey, ...base };
    },
    [values.password, errors],
  );

  const meetsRequirement = useCallback(
    (req: string) => {
      if (!values.password || !values.password.length) {
        return false;
      }
      return (errors as Record<string, string>)[req] === undefined;
    },
    [values.password, errors],
  );

  const renderErrors = useCallback(() => {
    if (!errors || typeof errors !== 'object') {
      return null;
    }
    const errorKeys = Object.keys(errors).filter(
      key =>
        submitCount > 0 &&
        touched &&
        (touched as Record<string, boolean>)[key] &&
        (errors as Record<string, string>)[key] &&
        typeof (errors as Record<string, string>)[key] === 'string',
    );

    if (errorKeys.length === 0) {
      return null;
    }

    return errorKeys.map(key => (
      <RatsText
        key={key}
        style={styles.errorMessage}
        text={(errors as Record<string, string>)[key]}
      />
    ));
  }, [errors, touched, submitCount]);

  const renderRequirement = useCallback(
    (text: string, req: string) => {
      return (
        <View style={[ROW, { width: '100%', justifyContent: 'space-between' }]}>
          <RatsText text={text} style={requirementStyle(req)} />
          {meetsRequirement(req) && (
            <RatsIcon name="check" size={20} style={{ color: color.green }} />
          )}
        </View>
      );
    },
    [requirementStyle, meetsRequirement],
  );

  const renderPasswordRequirements = useCallback(() => {
    if (values.password.length) {
      return (
        <View style={{ alignSelf: 'flex-start' }}>
          {renderRequirement('Minimum of 8 characters', 'characters')}
          {renderRequirement('Minimum of 1 uppercase letter', 'uppercase')}
          {renderRequirement('Minimum of 1 lowercase letter', 'lowercase')}
          {renderRequirement('Minimum of 1 number', 'number')}
        </View>
      );
    }
  }, [values.password, renderRequirement]);

  const signUpButtonDisabled = useCallback(() => {
    const disabled =
      !isValid || isSubmitting || Object.keys(errors).length > 0;
    return disabled;
  }, [isValid, isSubmitting, errors]);

  const isAdmin =
    signUpRole === 'admin' ||
    signUpRole === 'superAdmin' ||
    (invitation && invitation.type === 'admin');

  return (
    <View style={styles.signUpForm}>
      <View style={styles.errorContainer}>{renderErrors()}</View>
      {invitation && (
        <View
          testID="invitation-info"
          style={{
            backgroundColor: color.light_grey,
            padding: normalize(15),
            marginBottom: normalize(15),
            borderRadius: normalize(5),
          }}>
          <RatsText
            style={{
              fontSize: fontSize.regular_medium,
              color: color.dark_grey,
              marginBottom: normalize(5),
            }}
            text="You've been invited!"
          />
          {(invitation as any).houseName && (
            <RatsText
              style={{
                fontSize: fontSize.medium,
                color: color.black,
              }}
              text={`House: ${(invitation as any).houseName}`}
            />
          )}
          <RatsText
            testID="invited-as-role"
            style={{
              fontSize: fontSize.medium,
              color: color.black,
              fontWeight: '600' as const,
            }}
            text={`Role: ${isAdmin ? 'Manager' : 'Guest'}`}
          />
        </View>
      )}
      <Field
        component={RatsTextInput}
        name="email"
        testID="signup-email-input"
        styleType="secondary"
        autoCapitalize="none"
      />
      <Field
        style={IOS ? { textInput: { paddingTop: normalize(5) } } : {}}
        component={RatsTextInput}
        name="password"
        testID="signup-password-input"
        styleType="secondary"
        autoCapitalize="none"
        secureTextEntry={true}
      />
      <Field
        styleType="secondary"
        component={RatsTextInput}
        name="firstName"
        testID="signup-first-name-input"
      />
      <Field
        styleType="secondary"
        component={RatsTextInput}
        name="lastName"
        testID="signup-last-name-input"
      />
      {error &&
        typeof error === 'object' &&
        error.message && (
          <RatsText
            style={{
              color: 'red',
              textAlign: 'center' as const,
              fontSize: fontSize.large,
            }}
            text={error.nativeErrorMessage || error.message}
          />
        )}
      <View
        style={{
          width: '100%',
          paddingHorizontal: normalize(10),
          paddingBottom: normalize(20),
        }}>
        <Text
          style={{
            alignSelf: 'flex-start' as const,
            marginTop: normalize(20),
            marginBottom: normalize(10),
            color: color.dark_grey,
            fontSize: fontSize.regular_medium,
          }}>
          {'By signing up, you agree to our '}
          <Text
            onPress={() => Linking.openURL('https://regroup.app/terms')}
            style={{ color: color.baby_blue }}>
            Terms of Service
          </Text>
          {' and '}
          <Text
            onPress={() => Linking.openURL('https://regroup.app/privacy')}
            style={{ color: color.baby_blue }}>
            Privacy Policy
          </Text>
        </Text>
        <RatsButton
          testID="signup-button"
          disabled={
            !isValid ||
            isSubmitting ||
            Object.keys(errors).length > 0
          }
          title="SIGN UP"
          onPress={handleSubmit as any}
        />
        <View
          style={{
            justifyContent: 'center',
            marginTop: normalize(15),
            ...ROW,
          }}>
          <RatsText
            style={{
              fontFamily: fontFamily.roboto,
              fontSize: fontSize.regular_medium,
            }}
            text="I have an account."
          />
          <TouchableOpacity
            testID="login-link"
            onPress={() => navigation.navigate(Routes.Login)}>
            <RatsText
              style={{
                fontFamily: fontFamily.roboto,
                fontSize: fontSize.regular_medium,
                color: color.baby_blue,
                paddingLeft: normalize(10),
              }}
              text="Sign in"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SignUpFormView;
