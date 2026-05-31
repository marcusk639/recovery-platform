import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import LoginForm from './LoginForm';
import { RatsLogoHorizontal } from '../../components/rats-logo/rats-logo';
import {
  normalize,
  windowHeight,
  color,
  fontFamily,
  fontSize,
} from '../../styles/theme';
import { RatsText } from '../../components/rats-text';
import { getAuthenticationErrorMessage } from '../../constants/errors';
import { styles } from './LoginStyles';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import RatsLabel from '../../components/rats-label/rats-label';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import RatsModalForm from '../../components/rats-modal-form/rats-modal-form';
import { sendForgotPasswordEmail } from '../../services/users';
import { InitialLandingStyles } from '../Landing/InitialLanding';
import RatsScrollView from '../../components/rats-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IS_X } from '../../util/platform';
import { AuthScreenNavigationProp } from '../../navigation/types';
import { useAppSelector } from '../../state/store';

class FirebaseError {
  code: string = '';
  message: string = '';
}

interface LoginScreenProps {
  navigation: AuthScreenNavigationProp;
}

/**
 * Login Screen
 *
 * User authentication screen with email/password login and forgot password functionality.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 3 selectors to use state.user (removed 'as any' casts)
 * - No dispatch calls (form handles login)
 */
const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmailState] = useState('');
  const [forgotPasswordError, setForgotPasswordError] =
    useState<FirebaseError | null>(null);
  const [success, setSuccess] = useState(false);

  // Redux selectors
  const error = useAppSelector(state => state.user.error);
  const loggingIn = useAppSelector(state => state.user.loggingIn);
  const user = useAppSelector(state => state.user.user);

  const setEmail = useCallback((newEmail: string) => {
    setEmailState(newEmail);
    setSuccess(false);
    setForgotPasswordError(null);
  }, []);

  const toggleModal = useCallback(() => {
    setModalVisible(prev => !prev);
  }, []);

  const handleSendForgotPasswordEmail = useCallback(async () => {
    setSendingEmail(true);
    try {
      await sendForgotPasswordEmail(email);
      setSendingEmail(false);
      setSuccess(true);
    } catch (error) {
      setSendingEmail(false);
      setForgotPasswordError(error as FirebaseError);
    }
  }, [email]);

  const renderForgotPasswordForm = useCallback(() => {
    return (
      <View>
        <View>
          {forgotPasswordError && (
            <RatsLabel
              style={{ color: color.red, fontFamily: fontFamily.roboto }}
              label={getAuthenticationErrorMessage(forgotPasswordError.code)}
            />
          )}
          {success && (
            <RatsLabel
              style={{ color: color.green, fontFamily: fontFamily.roboto }}
              label="please.check.email"
            />
          )}
        </View>
        <RatsTextInput
          testID="reset-email-input"
          styleType="secondary"
          autoCapitalize="none"
          labelDisabled
          field={{ name: 'email', value: email }}
          customHandleChange={setEmail}
        />
      </View>
    );
  }, [forgotPasswordError, success, email, setEmail]);

  if (loggingIn) {
    return <RatsLoadingIndicator />;
  }

  return (
    <SafeAreaView style={{ flex: 1 }} testID="login-screen">
      <RatsScrollView
        keyboardShouldPersistTaps="handled"
        resetScrollToCoords={{ x: 0, y: 0 }}
        scrollEnabled
        extraScrollHeight={normalize(75)}
        contentContainerStyle={styles.container}
        enableOnAndroid>
        <View style={styles.viewContainer}>
          <View
            style={[
              {
                flex: 0.2,
                alignSelf: 'center',
                paddingTop: normalize(40),
                paddingHorizontal: IS_X ? normalize(20) : normalize(10),
              },
            ]}>
            <RatsLogoHorizontal imageStyle={InitialLandingStyles.image} />
          </View>
          <RatsText
            style={{
              fontSize: fontSize.larger,
              marginTop: normalize(40),
              marginBottom: normalize(15),
              fontWeight: '500' as const,
              alignSelf: 'flex-start' as const,
              paddingLeft: IS_X ? normalize(25) : normalize(25),
            }}
            text="Sign in"
          />
          <View
            style={{
              width: '80%',
              paddingLeft: IS_X ? normalize(25) : normalize(25),
            }}>
            {error && (
              <RatsText
                text={getAuthenticationErrorMessage(error.code)}
                style={styles.error}
              />
            )}
          </View>
          <LoginForm
            setEmail={setEmail}
            email={email}
            setModalVisible={toggleModal}
            navigation={navigation}
          />
        </View>
        <RatsModalForm
          testID="forgot-password-modal"
          submitButtonTestID="send-reset-email-button"
          modalStyle={{
            height: windowHeight / 3,
            justifyContent: 'flex-start',
          }}
          headerStyle={{ fontFamily: fontFamily.roboto }}
          loading={sendingEmail}
          visible={modalVisible}
          onBackdropPress={() => setModalVisible(false)}
          onSubmit={handleSendForgotPasswordEmail}
          disableSubmit={sendingEmail}
          formHeader="please.enter.email"
          errorMessage="">
          {renderForgotPasswordForm()}
        </RatsModalForm>
      </RatsScrollView>
    </SafeAreaView>
  );
};

export default LoginScreen;
