import React from 'react';
import { Field, FormikProps } from 'formik';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { View, TouchableOpacity } from 'react-native';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import RatsButton from '../../components/rats-button/rats-button';
import { LoginProps, LoginFormValues } from './LoginForm';
import { loginTextInputStyle, styles } from './LoginStyles';

import { RatsText } from '../../components/rats-text';
import { IS_E2E_TEST } from '../../util/e2e';
import {
  fontFamily,
  normalize,
  fontSize,
  color,
  ROW,
} from '../../styles/theme';
import { Routes } from '../../navigation/types';
import { IOS } from '../../util/platform';
const LoginFormView: React.FC<
  LoginProps & FormikProps<LoginFormValues>
> = props => {
  const { isSubmitting, handleSubmit, setModalVisible } = props;
  const passwordRef = React.useRef<any>(null);

  return (
    <View style={[styles.loginForm, { alignSelf: 'center' }]}>
      <Field
        component={RatsTextInput}
        name="email"
        testID="email-input"
        disabled={isSubmitting}
        styleType="secondary"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        component={RatsTextInput}
        name="password"
        testID="password-input"
        style={IOS ? { textInput: { paddingTop: normalize(5) } } : {}}
        styleType="secondary"
        disabled={isSubmitting}
        autoCapitalize="none"
        secureTextEntry={!IS_E2E_TEST}
        setRef={(ref: any) => {
          passwordRef.current = ref;
        }}
        lowerContent={
          <TouchableOpacity
            testID="forgot-password-link"
            style={{ paddingTop: normalize(2), marginBottom: normalize(10) }}
            onPress={setModalVisible}>
            <RatsText
              style={{
                fontFamily: fontFamily.roboto,
                fontSize: fontSize.regular_medium,
                color: color.baby_blue,
              }}
              text="Forgot password?"
            />
          </TouchableOpacity>
        }
      />
      <RatsButton
        testID="login-button"
        containerStyle={{ margin: normalize(10) }}
        title="SIGN IN"
        onPress={handleSubmit as any}
        disabled={isSubmitting}
      />
      <TouchableOpacity
        testID="signup-link"
        style={{ alignSelf: 'center', paddingVertical: normalize(10) }}
        onPress={() => props.navigation.navigate(Routes.Signup, {})}>
        <RatsText
          style={{
            fontFamily: fontFamily.roboto,
            fontSize: fontSize.regular_medium,
            color: color.baby_blue,
          }}
          text="Don't have an account? Sign up"
        />
      </TouchableOpacity>
    </View>
  );
};

export default LoginFormView;
