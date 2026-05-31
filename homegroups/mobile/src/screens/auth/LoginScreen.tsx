import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import SocialSignInButton from '../../components/common/SocialSignInButton';
import {signInWithApple, signInWithGoogle} from '../../services/firebase/auth';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  signIn,
  selectAuthStatus,
  selectAuthError,
  clearError,
} from '../../store/slices/authSlice';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Main: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const authError = useAppSelector(selectAuthError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({email: '', password: ''});

  // Clear previous auth errors when screen mounts
  useEffect(() => {
    dispatch(clearError());
  }, []);

  // Show backend errors
  useEffect(() => {
    if (authError) {
      Alert.alert('Login Failed', 'Please check your email and password');
    }
  }, [authError]);

  // Navigate to main app on successful login
  useEffect(() => {
    if (status === 'succeeded' && !authError) {
      navigation.replace('Main');
    }
  }, [status, authError]);

  const validateForm = () => {
    let isValid = true;
    const newErrors = {email: '', password: ''};

    // Basic email validation
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

  const handleLogin = async () => {
    if (!validateForm()) {
      return;
    }

    // Dispatch the sign in action
    try {
      await dispatch(signIn({email, password})).unwrap();
    } catch (error) {
      console.error('Login error:', error);
      // Alert.alert('Login Failed', 'Please check your email and password');
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Image
                source={require('../../assets/images/logo-2.jpg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>Homegroups</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={[styles.input, errors.email ? styles.inputError : null]}
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                testID="login-email-input"
              />
              {errors.email ? (
                <Text style={styles.errorText} testID="login-error-text">
                  {errors.email}
                </Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[
                  styles.input,
                  errors.password ? styles.inputError : null,
                ]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                testID="login-password-input"
              />
              {errors.password ? (
                <Text style={styles.errorText} testID="login-error-text">
                  {errors.password}
                </Text>
              ) : null}
            </View>

            <View style={styles.rememberForgotContainer}>
              <TouchableOpacity
                style={styles.rememberContainer}
                onPress={() => setRememberMe(!rememberMe)}>
                <View
                  style={[
                    styles.checkbox,
                    rememberMe ? styles.checkboxChecked : null,
                  ]}>
                  {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
                testID="login-forgot-password-button">
                <Text style={styles.forgotPassword}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={status === 'loading'}
              testID="login-signin-button">
              {status === 'loading' ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <SocialSignInButton
              provider="google"
              onPress={() => signInWithGoogle()}
              disabled={status === 'loading'}
            />
            <SocialSignInButton
              provider="apple"
              onPress={() => signInWithApple()}
              disabled={status === 'loading'}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              testID="login-register-link">
              <Text style={styles.registerLink}>Create an account</Text>
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
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#616161',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212121',
  },
  inputError: {
    borderColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  rememberForgotContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    marginRight: 8,
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
  rememberText: {
    fontSize: 14,
    color: '#616161',
  },
  forgotPassword: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    paddingHorizontal: 16,
    color: '#9E9E9E',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 14,
  },
  googleButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#757575',
    fontSize: 14,
    marginRight: 4,
  },
  registerLink: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default LoginScreen;
