import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import auth from '@react-native-firebase/auth';
import ScreenHeader from '../../components/screen-header';
import RatsScrollView from '../../components/rats-scroll-view';
import RatsButton from '../../components/rats-button/rats-button';
import { color } from '../../styles/theme';

const TwoFactorSetup: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<any>(null);
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');

  const sendCode = async () => {
    try {
      const result = await auth().signInWithPhoneNumber(phone);
      setConfirmation(result);
      setStep('code');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send code.');
    }
  };

  const verifyCode = async () => {
    try {
      const credential = auth.PhoneAuthProvider.credential(
        confirmation.verificationId,
        code,
      );
      await auth().currentUser?.linkWithCredential(credential);
      setStep('done');
      Alert.alert(
        '2FA Enabled',
        'Your account is now protected with two-factor authentication.',
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid code.');
    }
  };

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Two-Factor Authentication" />
      <View style={styles.container}>
        {step === 'phone' && (
          <>
            <Text style={styles.desc}>
              Enter your phone number to receive a verification code.
            </Text>
            <TextInput
              testID="phone-input"
              style={styles.input}
              placeholder="+1 555 000 0000"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <RatsButton
              testID="send-code-button"
              title="Send Code"
              onPress={sendCode}
            />
          </>
        )}
        {step === 'code' && (
          <>
            <Text style={styles.desc}>
              Enter the 6-digit code sent to {phone}.
            </Text>
            <TextInput
              testID="verification-code-input"
              style={styles.input}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <RatsButton
              testID="verify-code-button"
              title="Verify"
              onPress={verifyCode}
            />
          </>
        )}
        {step === 'done' && (
          <Text style={styles.success}>2FA is enabled on your account.</Text>
        )}
      </View>
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  desc: { fontSize: 15, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 16,
  },
  success: {
    fontSize: 16,
    color: color.green,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default TwoFactorSetup;
