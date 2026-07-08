import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {registerWithEmail} from '../../services/firebase/auth';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithFacebook,
} from '../../services/firebase/auth';
import {AuthStackParamList} from '../../types';
import {Button} from '../../components/common/Button';
import {Input} from '../../components/common/Input';
import SocialSignInButton from '../../components/common/SocialSignInButton';
import DatePicker from '../../components/common/DatePicker';
import {validateEmail, validatePassword} from '../../utils/validation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Define RegisterScreen props
type RegisterScreenProps = {
  navigation: StackNavigationProp<AuthStackParamList, 'Register'>;
};

const RegisterScreen: React.FC<RegisterScreenProps> = ({navigation}) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  // Form data
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [useInitialOnly, setUseInitialOnly] = useState<boolean>(false);
  const [recoveryDate, setRecoveryDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // Privacy settings
  const [showRecoveryDate, setShowRecoveryDate] = useState<boolean>(false);
  const [allowDirectMessages, setAllowDirectMessages] = useState<boolean>(true);

  // Terms acceptance
  const [agreeToTerms, setAgreeToTerms] = useState<boolean>(false);
  const [agreeToPrivacyPolicy, setAgreeToPrivacyPolicy] =
    useState<boolean>(false);

  // Form validation errors
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    terms: '',
  });

  // Validate step 1 (email/password)
  const validateStep1 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};

    // Email validation
    const emailError = validateEmail(email);
    if (emailError) {
      newErrors.email = emailError;
      isValid = false;
    } else {
      newErrors.email = '';
    }

    // Password validation
    const passwordError = validatePassword(password);
    if (passwordError) {
      newErrors.password = passwordError;
      isValid = false;
    } else {
      newErrors.password = '';
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    } else {
      newErrors.confirmPassword = '';
    }

    setErrors(newErrors);
    return isValid;
  };

  // Validate step 2 (profile and privacy)
  const validateStep2 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};

    // Display name validation
    if (!displayName.trim()) {
      newErrors.displayName = 'Name is required';
      isValid = false;
    } else {
      newErrors.displayName = '';
    }

    setErrors(newErrors);
    return isValid;
  };

  // Validate final step (terms acceptance)
  const validateStep3 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};

    // Terms validation
    if (!agreeToTerms || !agreeToPrivacyPolicy) {
      newErrors.terms =
        'You must agree to the Terms of Service and Privacy Policy';
      isValid = false;
    } else {
      newErrors.terms = '';
    }

    setErrors(newErrors);
    return isValid;
  };

  // Handle step navigation
  const nextStep = (): void => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const prevStep = (): void => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Handle registration with email/password
  const handleRegister = async (): Promise<void> => {
    if (!validateStep3()) {
      return;
    }

    setLoading(true);
    try {
      // Prepare registration data
      const registrationData = {
        email,
        password,
        displayName: useInitialOnly ? displayName.charAt(0) + '.' : displayName,
        recoveryDate: recoveryDate || undefined,
        privacySettings: {
          showRecoveryDate,
          allowDirectMessages,
        },
        agreeToTerms, // This should be logged in the user record
        agreeToPrivacyPolicy, // This should be logged in the user record
      };

      // Register with Firebase
      await registerWithEmail(registrationData);

      // Navigate to Main screen (handled by auth state listener)
    } catch (error) {
      let errorMessage = 'Registration failed. Please try again.';

      if (error instanceof Error) {
        // Handle specific Firebase errors
        if (error.message.includes('email-already-in-use')) {
          errorMessage =
            'This email is already registered. Please use a different email or sign in.';
        } else if (error.message.includes('invalid-email')) {
          errorMessage = 'The email address is not valid.';
        } else if (error.message.includes('weak-password')) {
          errorMessage =
            'The password is too weak. Please choose a stronger password.';
        }
      }

      Alert.alert('Registration Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle social sign-in
  const handleSocialSignIn = async (
    provider: 'google' | 'apple' | 'facebook',
  ): Promise<void> => {
    setLoading(true);
    try {
      switch (provider) {
        case 'google':
          await signInWithGoogle();
          break;
        case 'apple':
          await signInWithApple();
          break;
        case 'facebook':
          await signInWithFacebook();
          break;
      }
      // Navigation will be handled by auth state listener
    } catch (error) {
      Alert.alert(
        'Social Sign In Failed',
        'There was a problem signing in. Please try again or use email registration.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    setShowDatePicker(false);
    if (date) {
      // Format date as YYYY-MM-DD
      const formattedDate = date.toISOString().split('T')[0];
      setRecoveryDate(formattedDate);
    }
  };

  // Format date for display
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return '';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString;
    }
  };

  // Render step 1: Account credentials
  const renderStep1 = () => (
    <View>
      <Text style={styles.stepTitle}>Create Your Account</Text>
      <Text style={styles.stepDescription}>
        Start your recovery journey with a secure account.
      </Text>

      <Input
        label="Email"
        value={email}
        onChangeText={text => setEmail(text)}
        placeholder="your.email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
        testID="register-email-input"
      />

      <Input
        label="Password"
        value={password}
        onChangeText={text => setPassword(text)}
        placeholder="Create a secure password"
        secureTextEntry
        error={errors.password}
        testID="register-password-input"
      />
      <Text style={styles.helperText}>
        Password must be at least 8 characters and include a mix of letters and
        numbers.
      </Text>

      <Input
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={text => setConfirmPassword(text)}
        placeholder="Confirm your password"
        secureTextEntry
        error={errors.confirmPassword}
        testID="register-confirm-password-input"
      />

      <View style={styles.socialSignInContainer}>
        <Text style={styles.orText}>- OR -</Text>
        <SocialSignInButton
          provider="google"
          onPress={() => handleSocialSignIn('google')}
          disabled={loading}
        />
        {Platform.OS === 'ios' && (
          <SocialSignInButton
            provider="apple"
            onPress={() => handleSocialSignIn('apple')}
            disabled={loading}
          />
        )}
        {/* <SocialSignInButton
          provider="facebook"
          onPress={() => handleSocialSignIn('facebook')}
          disabled={loading}
        /> */}
      </View>

      <Button
        title="Continue"
        onPress={nextStep}
        disabled={loading}
        loading={loading}
        fullWidth
        testID="register-next-button"
      />
    </View>
  );

  // Render step 2: Profile and privacy
  const renderStep2 = () => (
    <View>
      <Text style={styles.stepTitle}>Your Profile</Text>
      <Text style={styles.stepDescription}>
        We respect your anonymity. Only enter information you're comfortable
        sharing.
      </Text>

      <Input
        label="Display Name"
        value={displayName}
        onChangeText={text => setDisplayName(text)}
        placeholder="First name or nickname"
        error={errors.displayName}
        testID="register-displayname-input"
      />

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Use first initial only</Text>
        <Switch
          value={useInitialOnly}
          onValueChange={setUseInitialOnly}
          trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
          thumbColor={useInitialOnly ? '#2196F3' : '#FFFFFF'}
        />
      </View>
      <Text style={styles.helperText}>
        If enabled, only your first initial will be shown to other users (e.g.,
        "J.")
      </Text>

      <Text style={styles.sectionTitle}>Recovery Date (Optional)</Text>
      <TouchableOpacity
        style={styles.datePickerButton}
        onPress={() => setShowDatePicker(true)}
        testID="register-datepicker-button">
        <Text style={styles.datePickerButtonText}>
          {recoveryDate
            ? formatDateForDisplay(recoveryDate)
            : 'Select your recovery date'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.helperText}>
        This is used only for calculating sobriety time and optional
        celebrations.
      </Text>

      <DatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSelect={handleDateSelect}
        initialDate={recoveryDate ? new Date(recoveryDate) : new Date()}
        maxDate={new Date()} // Can't select future dates
      />

      <Text style={styles.sectionTitle}>Privacy Settings</Text>

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Share recovery date with groups</Text>
        <Switch
          value={showRecoveryDate}
          onValueChange={setShowRecoveryDate}
          trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
          thumbColor={showRecoveryDate ? '#2196F3' : '#FFFFFF'}
        />
      </View>
      <Text style={styles.helperText}>
        Allow your recovery date to be visible to members of your home groups.
      </Text>

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Allow direct messages</Text>
        <Switch
          value={allowDirectMessages}
          onValueChange={setAllowDirectMessages}
          trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
          thumbColor={allowDirectMessages ? '#2196F3' : '#FFFFFF'}
        />
      </View>
      <Text style={styles.helperText}>
        Allow other members to send you private messages. You can change this
        later.
      </Text>

      <View style={styles.buttonsContainer}>
        <Button
          title="Back"
          variant="outline"
          onPress={prevStep}
          style={styles.backButton}
        />
        <Button
          title="Continue"
          onPress={nextStep}
          style={styles.continueButton}
          testID="register-continue-button"
        />
      </View>
    </View>
  );

  // Render step 3: Terms acceptance
  const renderStep3 = () => (
    <View>
      <Text style={styles.stepTitle}>Terms of Service & Privacy</Text>
      <Text style={styles.stepDescription}>
        Please review and accept our terms to complete registration.
      </Text>

      <View style={styles.termsContainer}>
        <Text style={styles.termsTitle}>Our Commitment to Privacy</Text>
        <Text style={styles.termsText}>
          Homegroups is designed with your privacy and anonymity in mind. We
          adhere to the traditions of 12-step programs in how we handle your
          personal information.
        </Text>

        <Text style={styles.termsSubtitle}>What We Do:</Text>
        <Text style={styles.termsText}>
          • Store only the information you explicitly provide{'\n'}• Use first
          names or initials only by default{'\n'}• Provide granular privacy
          controls{'\n'}• Secure your communications with TLS encryption{'\n'}•
          Allow you to control who sees your recovery date
        </Text>

        <Text style={styles.termsSubtitle}>What We Don't Do:</Text>
        <Text style={styles.termsText}>
          • Sell your data to third parties{'\n'}• Integrate with social media
          {'\n'}• Track your location when not using the app{'\n'}• Reveal your
          identity to others without permission
        </Text>
      </View>

      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setAgreeToTerms(!agreeToTerms)}
        testID="register-terms-checkbox">
        <View
          style={[styles.checkbox, agreeToTerms ? styles.checkboxChecked : {}]}>
          {agreeToTerms && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.checkboxTextContainer}>
          <Text style={styles.checkboxText}>
            I agree to the{' '}
            <Text
              style={styles.textLink}
              onPress={() =>
                Linking.openURL('https://recovery-connect-cad4b.web.app/terms')
              }>
              Terms of Service
            </Text>
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setAgreeToPrivacyPolicy(!agreeToPrivacyPolicy)}>
        <View
          style={[
            styles.checkbox,
            agreeToPrivacyPolicy ? styles.checkboxChecked : {},
          ]}>
          {agreeToPrivacyPolicy && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.checkboxTextContainer}>
          <Text style={styles.checkboxText}>
            I agree to the{' '}
            <Text
              style={styles.textLink}
              onPress={() =>
                Linking.openURL(
                  'https://recovery-connect-cad4b.web.app/privacy',
                )
              }>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </TouchableOpacity>

      {errors.terms ? (
        <Text style={styles.errorText} testID="register-error-text">
          {errors.terms}
        </Text>
      ) : null}

      <View style={styles.buttonsContainer}>
        <Button
          title="Back"
          variant="outline"
          onPress={prevStep}
          style={styles.backButton}
          disabled={loading}
        />
        <Button
          title="Create Account"
          onPress={handleRegister}
          style={styles.continueButton}
          loading={loading}
          disabled={loading}
          testID="register-create-account-button"
        />
      </View>
    </View>
  );

  // Component to render progress indicator
  const ProgressIndicator = (): React.ReactElement => (
    <View style={styles.progressContainer}>
      <View style={styles.progressStep}>
        <View style={[styles.stepCircle, step >= 1 ? styles.activeStep : {}]}>
          <Text
            style={[
              styles.stepNumber,
              step >= 1 ? styles.activeStepNumber : {},
            ]}>
            1
          </Text>
        </View>
        <Text
          style={[styles.stepLabel, step >= 1 ? styles.activeStepLabel : {}]}>
          Account
        </Text>
      </View>

      <View
        style={[
          styles.progressLine,
          step >= 2 ? styles.activeProgressLine : {},
        ]}
      />

      <View style={styles.progressStep}>
        <View style={[styles.stepCircle, step >= 2 ? styles.activeStep : {}]}>
          <Text
            style={[
              styles.stepNumber,
              step >= 2 ? styles.activeStepNumber : {},
            ]}>
            2
          </Text>
        </View>
        <Text
          style={[styles.stepLabel, step >= 2 ? styles.activeStepLabel : {}]}>
          Profile
        </Text>
      </View>

      <View
        style={[
          styles.progressLine,
          step >= 3 ? styles.activeProgressLine : {},
        ]}
      />

      <View style={styles.progressStep}>
        <View style={[styles.stepCircle, step >= 3 ? styles.activeStep : {}]}>
          <Text
            style={[
              styles.stepNumber,
              step >= 3 ? styles.activeStepNumber : {},
            ]}>
            3
          </Text>
        </View>
        <Text
          style={[styles.stepLabel, step >= 3 ? styles.activeStepLabel : {}]}>
          Terms
        </Text>
      </View>
    </View>
  );

  // Render different steps based on current step state
  const renderStepContent = (): React.ReactElement => {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return <View />;
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="register-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Logo and App Name */}
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Image
                source={require('../../assets/images/logo-2.jpg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>Homegroups</Text>
          </View>

          {/* Registration Form Card */}
          <View style={styles.formCard}>
            {/* Progress Indicator */}
            <ProgressIndicator />

            {/* Step Content */}
            {renderStepContent()}
          </View>

          {/* Sign In Link */}
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              testID="register-login-link">
              <Text style={styles.signInLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  progressStep: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeStep: {
    backgroundColor: '#2196F3',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#757575',
  },
  activeStepNumber: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 12,
    color: '#757575',
  },
  activeStepLabel: {
    color: '#2196F3',
    fontWeight: '500',
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  activeProgressLine: {
    backgroundColor: '#2196F3',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 24,
  },
  helperText: {
    color: '#757575',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: '#424242',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginTop: 24,
    marginBottom: 12,
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  datePickerButtonText: {
    fontSize: 16,
    color: '#212121',
  },
  socialSignInContainer: {
    marginVertical: 16,
  },
  orText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9E9E9E',
    marginVertical: 16,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  backButton: {
    flex: 0.48,
  },
  continueButton: {
    flex: 0.48,
  },
  termsContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  termsSubtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
    marginTop: 12,
    marginBottom: 4,
  },
  termsText: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxText: {
    fontSize: 14,
    color: '#616161',
    lineHeight: 20,
  },
  textLink: {
    color: '#2196F3',
    fontWeight: '500',
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  signInText: {
    color: '#757575',
    fontSize: 14,
    marginRight: 4,
  },
  signInLink: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default RegisterScreen;
