import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectGroupById,
  updateGroupPaymentLinks,
} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {PaymentLinks} from '../../types';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'PaymentLinksSetup'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'PaymentLinksSetup'
>;

// Helper to normalize Venmo username
const normalizeVenmo = (input: string): string => {
  if (!input) return '';
  // Remove @ if present, trim whitespace
  return input.trim().replace(/^@/, '');
};

// Helper to normalize CashApp tag
const normalizeCashApp = (input: string): string => {
  if (!input) return '';
  // Remove $ if present, trim whitespace
  return input.trim().replace(/^\$/, '');
};

// Helper to normalize PayPal
const normalizePayPal = (input: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  // If it's a full URL, extract the username
  const paypalMeMatch = trimmed.match(/paypal\.me\/([^\/\?]+)/i);
  if (paypalMeMatch) {
    return paypalMeMatch[1];
  }
  // Otherwise just return cleaned input
  return trimmed.replace(/^@/, '');
};

const PaymentLinksSetupScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName} = route.params;

  const group = useAppSelector(state => selectGroupById(state, groupId));

  // Form state
  const [venmo, setVenmo] = useState('');
  const [cashApp, setCashApp] = useState('');
  const [paypal, setPaypal] = useState('');
  const [zelle, setZelle] = useState('');
  const [saving, setSaving] = useState(false);

  // Load existing values
  useEffect(() => {
    if (group?.paymentLinks) {
      setVenmo(group.paymentLinks.venmo || '');
      setCashApp(group.paymentLinks.cashApp || '');
      setPaypal(group.paymentLinks.paypal || '');
      setZelle(group.paymentLinks.zelle || '');
    }
  }, [group?.paymentLinks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const paymentLinks: PaymentLinks = {};

      // Only include non-empty values, normalized
      const normalizedVenmo = normalizeVenmo(venmo);
      const normalizedCashApp = normalizeCashApp(cashApp);
      const normalizedPayPal = normalizePayPal(paypal);
      const normalizedZelle = zelle.trim();

      if (normalizedVenmo) paymentLinks.venmo = normalizedVenmo;
      if (normalizedCashApp) paymentLinks.cashApp = normalizedCashApp;
      if (normalizedPayPal) paymentLinks.paypal = normalizedPayPal;
      if (normalizedZelle) paymentLinks.zelle = normalizedZelle;

      await dispatch(updateGroupPaymentLinks({groupId, paymentLinks})).unwrap();

      Alert.alert(
        'Saved!',
        'Your payment links have been updated. Members can now donate to your group.',
        [{text: 'OK', onPress: () => navigation.goBack()}],
      );
    } catch (error: any) {
      console.error('Error saving payment links:', error);
      Alert.alert('Error', error.message || 'Failed to save payment links');
    } finally {
      setSaving(false);
    }
  };

  const hasAnyLink =
    venmo.trim() || cashApp.trim() || paypal.trim() || zelle.trim();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Icon name="hand-heart" size={48} color="#4CAF50" />
          <Text style={styles.title}>Set Up Donations</Text>
          <Text style={styles.subtitle}>
            Add your payment links so members can easily donate to {groupName}
          </Text>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Icon name="lightbulb-outline" size={20} color="#1565C0" />
          <Text style={styles.infoBannerText}>
            Just add the accounts you already use. Members will see buttons to
            donate via their preferred app.
          </Text>
        </View>

        {/* Manual Tracking Notice */}
        <View style={styles.trackingNotice}>
          <Icon name="information-outline" size={18} color="#FF9800" />
          <Text style={styles.trackingNoticeText}>
            Donations via these apps will be self-reported by members. For
            automatic treasury tracking, set up Stripe below.
          </Text>
        </View>

        {/* Payment Link Inputs */}
        <View style={styles.inputsContainer}>
          {/* Venmo */}
          <View style={styles.inputGroup}>
            <View style={styles.inputHeader}>
              <View style={[styles.appIcon, {backgroundColor: '#008CFF'}]}>
                <Text style={styles.appIconText}>V</Text>
              </View>
              <Text style={styles.inputLabel}>Venmo</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefix}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="YourGroupName"
                value={venmo}
                onChangeText={setVenmo}
                autoCapitalize="none"
                autoCorrect={false}
                testID="venmo-input"
              />
            </View>
            <Text style={styles.inputHint}>
              Enter your Venmo username (without the @)
            </Text>
          </View>

          {/* Cash App */}
          <View style={styles.inputGroup}>
            <View style={styles.inputHeader}>
              <View style={[styles.appIcon, {backgroundColor: '#00D632'}]}>
                <Text style={styles.appIconText}>$</Text>
              </View>
              <Text style={styles.inputLabel}>Cash App</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefix}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="YourGroupName"
                value={cashApp}
                onChangeText={setCashApp}
                autoCapitalize="none"
                autoCorrect={false}
                testID="cashapp-input"
              />
            </View>
            <Text style={styles.inputHint}>
              Enter your Cash App $cashtag (without the $)
            </Text>
          </View>

          {/* PayPal */}
          <View style={styles.inputGroup}>
            <View style={styles.inputHeader}>
              <View style={[styles.appIcon, {backgroundColor: '#003087'}]}>
                <Text style={styles.appIconText}>P</Text>
              </View>
              <Text style={styles.inputLabel}>PayPal</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefixSmall}>paypal.me/</Text>
              <TextInput
                style={styles.input}
                placeholder="YourGroupName"
                value={paypal}
                onChangeText={setPaypal}
                autoCapitalize="none"
                autoCorrect={false}
                testID="paypal-input"
              />
            </View>
            <Text style={styles.inputHint}>
              Enter your PayPal.me username or paste your full link
            </Text>
          </View>

          {/* Zelle */}
          <View style={styles.inputGroup}>
            <View style={styles.inputHeader}>
              <View style={[styles.appIcon, {backgroundColor: '#6D1ED4'}]}>
                <Text style={styles.appIconText}>Z</Text>
              </View>
              <Text style={styles.inputLabel}>Zelle</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputFull]}
              placeholder="email@example.com or phone number"
              value={zelle}
              onChangeText={setZelle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="zelle-input"
            />
            <Text style={styles.inputHint}>
              Enter the email or phone linked to your Zelle account
            </Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, !hasAnyLink && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !hasAnyLink}
          testID="save-payment-links-button">
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Icon name="check" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Payment Links</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Stripe Connect Option */}
        <View style={styles.stripeSection}>
          <View style={styles.stripeSectionHeader}>
            <Icon name="credit-card-check" size={24} color="#635BFF" />
            <Text style={styles.stripeSectionTitle}>
              Want Automatic Tracking?
            </Text>
          </View>

          <View style={styles.stripeFeatures}>
            <View style={styles.stripeFeatureRow}>
              <Icon name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.stripeFeatureText}>
                Donations automatically added to treasury
              </Text>
            </View>
            <View style={styles.stripeFeatureRow}>
              <Icon name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.stripeFeatureText}>
                In-app credit card payments
              </Text>
            </View>
            <View style={styles.stripeFeatureRow}>
              <Icon name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.stripeFeatureText}>
                Automatic receipts for donors
              </Text>
            </View>
            <View style={styles.stripeFeatureRow}>
              <Icon name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.stripeFeatureText}>
                Detailed donation reports
              </Text>
            </View>
          </View>

          {group?.stripeConnectAccountId ? (
            <View style={styles.stripeConnectedBadge}>
              <Icon name="check-circle" size={18} color="#4CAF50" />
              <Text style={styles.stripeConnectedText}>
                Stripe Connect Active
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.stripeSetupNote}>
                Requires ~10 min setup with business verification
              </Text>
              <TouchableOpacity
                style={styles.stripeSetupButton}
                onPress={() => navigation.goBack()}
                testID="setup-stripe-button">
                <Icon name="credit-card-plus" size={20} color="#FFFFFF" />
                <Text style={styles.stripeSetupButtonText}>
                  Set Up Stripe Connect
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    marginLeft: 12,
    lineHeight: 20,
  },
  inputsContainer: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appIconText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  inputPrefix: {
    paddingLeft: 14,
    paddingRight: 2,
    fontSize: 18,
    color: '#757575',
    fontWeight: '500',
  },
  inputPrefixSmall: {
    paddingLeft: 14,
    paddingRight: 2,
    fontSize: 14,
    color: '#757575',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 14,
    fontSize: 16,
    color: '#212121',
  },
  inputFull: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingLeft: 14,
  },
  inputHint: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 6,
    marginLeft: 2,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  saveButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  trackingNotice: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  trackingNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#F57C00',
    marginLeft: 10,
    lineHeight: 18,
  },
  stripeSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#635BFF',
    borderStyle: 'dashed',
  },
  stripeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stripeSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginLeft: 10,
  },
  stripeFeatures: {
    marginBottom: 16,
  },
  stripeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stripeFeatureText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 8,
  },
  stripeSetupNote: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 12,
  },
  stripeSetupButton: {
    flexDirection: 'row',
    backgroundColor: '#635BFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeSetupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  stripeConnectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 10,
  },
  stripeConnectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 8,
  },
});

export default PaymentLinksSetupScreen;
