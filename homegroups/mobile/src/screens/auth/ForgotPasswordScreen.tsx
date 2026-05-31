import React, {useState} from 'react';
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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';

// Import types
import {AuthStackParamList} from '../../types/navigation';

type ForgotPasswordScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<ForgotPasswordScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');

  const handleResetPassword = async () => {
    // Validate email
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await auth().sendPasswordResetEmail(email);
      setEmailSent(true);
    } catch (error: any) {
      console.error('Password reset error:', error);

      // Handle different error codes
      if (error.code === 'auth/user-not-found') {
        setError('No account exists with this email');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address');
      } else {
        setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="forgot-password-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            testID="forgot-password-back-button">
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Enter your email address and we'll send you instructions to
                reset your password.
              </Text>
            </View>

            {emailSent ? (
              <View style={styles.successContainer}>
                <View style={styles.successIcon}>
                  <Text style={styles.successIconText}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Check your inbox</Text>
                <Text style={styles.successMessage}>
                  We've sent password reset instructions to {email}
                </Text>
                <TouchableOpacity
                  style={styles.returnButton}
                  onPress={() => navigation.navigate('Login')}
                  testID="forgot-password-return-to-login-button">
                  <Text style={styles.returnButtonText}>Return to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formContainer}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={[styles.input, error ? styles.inputError : null]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Your email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    editable={!loading}
                    testID="forgot-password-email-input"
                  />
                  {error ? (
                    <Text
                      style={styles.errorText}
                      testID="forgot-password-error-text">
                      {error}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.resetButton, loading && styles.disabledButton]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  testID="forgot-password-reset-button">
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.resetButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 16,
    color: '#2196F3',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    lineHeight: 24,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#424242',
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
    fontSize: 14,
    color: '#F44336',
    marginTop: 8,
  },
  resetButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#BDBDBD',
  },
  successContainer: {
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIconText: {
    color: '#FFFFFF',
    fontSize: 32,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  returnButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  returnButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
