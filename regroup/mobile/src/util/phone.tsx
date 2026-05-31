import { Linking, Alert, Platform } from 'react-native';

export const callNumber = (phone: string) => {
  let phoneNumber = phone;
  if (Platform.OS !== 'android') {
    phoneNumber = `telprompt:${phone}`;
  } else {
    phoneNumber = `tel:${phone}`;
  }
  Linking.canOpenURL(phoneNumber)
    .then(supported => {
      if (!supported) {
        Alert.alert('Phone number is not available');
      } else {
        return Linking.openURL(phoneNumber);
      }
    })
    .catch(err => {
      console.error('CALL NUMBER ERROR', err);
    });
};

function getSMSDivider(): string {
  return Platform.OS === 'ios' ? '&' : '?';
}

function openUrl(url: string): Promise<any> {
  return Linking.openURL(url);
}

export function openSmsUrl(phone: string, body: string): Promise<any> {
  return openUrl(`sms:${phone}${getSMSDivider()}body=${body}`);
}
