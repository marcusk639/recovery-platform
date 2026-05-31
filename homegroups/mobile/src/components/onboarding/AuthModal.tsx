import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  registerWithEmail,
  signInWithGoogle,
  signInWithApple,
} from '../../services/firebase/auth';
import {loginWithEmail} from '../../services/firebase/auth';
import {validateEmail, validatePassword} from '../../utils/validation';
import SocialSignInButton from '../common/SocialSignInButton';

const {height} = Dimensions.get('window');

type AuthTab = 'signup' | 'login';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
  title?: string;
  subtitle?: string;
}

const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onAuthSuccess,
  title = 'Create Your Account',
  subtitle = 'Sign up to continue with your action',
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('signup');
  const [loading, setLoading] = useState(false);

  // Signup form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Validation errors
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setDisplayName('');
      setErrors({
        email: '',
        password: '',
        confirmPassword: '',
        displayName: '',
      });
      setActiveTab('signup');
    }
  }, [visible]);

  const validateSignupForm = (): boolean => {
    let isValid = true;
    const newErrors = {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
    };

    // Email validation
    const emailError = validateEmail(email);
    if (emailError) {
      newErrors.email = emailError;
      isValid = false;
    }

    // Password validation
    const passwordError = validatePassword(password);
    if (passwordError) {
      newErrors.password = passwordError;
      isValid = false;
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    // Display name validation
    if (!displayName.trim()) {
      newErrors.displayName = 'First name is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const validateLoginForm = (): boolean => {
    let isValid = true;
    const newErrors = {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
    };

    // Email validation
    if (!email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSignup = async () => {
    if (!validateSignupForm()) return;

    setLoading(true);
    try {
      await registerWithEmail({
        email,
        password,
        displayName: displayName.trim(),
      });
      onAuthSuccess();
    } catch (error: any) {
      let errorMessage = 'Registration failed. Please try again.';
      if (error.message?.includes('email-already-in-use')) {
        errorMessage =
          'This email is already registered. Please sign in instead.';
        setActiveTab('login');
      } else if (error.message?.includes('invalid-email')) {
        errorMessage = 'The email address is not valid.';
      } else if (error.message?.includes('weak-password')) {
        errorMessage = 'The password is too weak.';
      }
      Alert.alert('Registration Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validateLoginForm()) return;

    setLoading(true);
    try {
      await loginWithEmail({email, password});
      onAuthSuccess();
    } catch (error: any) {
      Alert.alert('Login Failed', 'Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'google' | 'apple') => {
    setLoading(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
      onAuthSuccess();
    } catch (error: any) {
      if (error.message?.includes('cancelled')) {
        // User cancelled, don't show error
        return;
      }
      Alert.alert(
        'Sign In Failed',
        'There was a problem signing in. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = () => {
    if (activeTab === 'signup') {
      return (
        <>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={[
                styles.input,
                errors.displayName ? styles.inputError : null,
              ]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your first name"
              autoCapitalize="words"
              editable={!loading}
              testID="auth-modal-name-input"
            />
            {errors.displayName ? (
              <Text style={styles.errorText}>{errors.displayName}</Text>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email ? styles.inputError : null]}
              value={email}
              onChangeText={setEmail}
              placeholder="your.email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
              testID="auth-modal-email-input"
            />
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email}</Text>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, errors.password ? styles.inputError : null]}
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              secureTextEntry
              editable={!loading}
              testID="auth-modal-password-input"
            />
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password}</Text>
            ) : (
              <Text style={styles.helperText}>At least 8 characters</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[
                styles.input,
                errors.confirmPassword ? styles.inputError : null,
              ]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry
              editable={!loading}
              testID="auth-modal-confirm-password-input"
            />
            {errors.confirmPassword ? (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            testID="auth-modal-signup-button">
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </>
      );
    }

    // Login tab
    return (
      <>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            value={email}
            onChangeText={setEmail}
            placeholder="your.email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
            testID="auth-modal-login-email-input"
          />
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, errors.password ? styles.inputError : null]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            editable={!loading}
            testID="auth-modal-login-password-input"
          />
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          testID="auth-modal-login-button">
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            disabled={loading}
            testID="auth-modal-close-button">
            <Icon name="close" size={24} color="#424242" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'signup' && styles.activeTab]}
              onPress={() => setActiveTab('signup')}
              disabled={loading}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'signup' && styles.activeTabText,
                ]}>
                Sign Up
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'login' && styles.activeTab]}
              onPress={() => setActiveTab('login')}
              disabled={loading}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'login' && styles.activeTabText,
                ]}>
                Login
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Content */}
          <View style={styles.formContainer}>{renderTabContent()}</View>

          {/* Social Sign-In Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Sign-In Buttons */}
          <View style={styles.socialContainer}>
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
          </View>

          {/* Privacy Note */}
          <Text style={styles.privacyNote}>
            By creating an account, you agree to our Terms of Service and
            Privacy Policy. We respect your anonymity and never share your
            information.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginRight: -8,
    marginTop: -8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#757575',
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  activeTabText: {
    color: '#2196F3',
  },
  formContainer: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  inputError: {
    borderColor: '#F44336',
    backgroundColor: '#FFF5F5',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    color: '#9E9E9E',
    fontSize: 12,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    paddingHorizontal: 16,
    color: '#9E9E9E',
    fontSize: 13,
  },
  socialContainer: {
    gap: 12,
    marginBottom: 24,
  },
  privacyNote: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default AuthModal;
