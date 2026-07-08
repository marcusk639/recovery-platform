import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Linking,
  Modal,
  AppState,
  AppStateStatus,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useStripe} from '@stripe/stripe-react-native';
import functions from '@react-native-firebase/functions';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useSelector} from 'react-redux';
import {selectUser, selectUserData} from '../../store/slices/authSlice';
import {
  completeDonation,
  selectGroupById,
} from '../../store/slices/groupsSlice';
import {addExternalDonation} from '../../store/slices/treasurySlice';
import {useAppDispatch, useAppSelector} from '../../store';
import {parseDeepLinkUrl} from '../../utils/url';
import {PaymentLinks} from '../../types';
import auth from '@react-native-firebase/auth';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'GroupDonation'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'GroupDonation'
>;

// Suggested donation amounts
const SUGGESTED_AMOUNTS = [5, 10, 20, 50];

// Payment method configuration with amount support
const PAYMENT_METHODS = [
  {
    id: 'venmo',
    name: 'Venmo',
    color: '#008CFF',
    icon: 'V',
    supportsAmount: true,
    getUrl: (username: string, amount?: number, groupName?: string) => {
      const note = encodeURIComponent(`Donation to ${groupName || 'group'}`);
      const base = `venmo://paycharge?txn=pay&recipients=${username}&note=${note}`;
      return amount ? `${base}&amount=${amount}` : base;
    },
    getFallbackUrl: (username: string, amount?: number) => {
      // Venmo web doesn't support amount pre-fill
      return `https://venmo.com/u/${username}`;
    },
  },
  {
    id: 'cashApp',
    name: 'Cash App',
    color: '#00D632',
    icon: '$',
    supportsAmount: true,
    getUrl: (tag: string, amount?: number) => {
      // Cash App supports amount in URL path
      return amount
        ? `https://cash.app/$${tag}/${amount}`
        : `https://cash.app/$${tag}`;
    },
    getFallbackUrl: (tag: string, amount?: number) => {
      return amount
        ? `https://cash.app/$${tag}/${amount}`
        : `https://cash.app/$${tag}`;
    },
  },
  {
    id: 'paypal',
    name: 'PayPal',
    color: '#003087',
    icon: 'P',
    supportsAmount: true,
    getUrl: (username: string, amount?: number) => {
      // PayPal.me supports amount in URL path
      return amount
        ? `https://paypal.me/${username}/${amount}`
        : `https://paypal.me/${username}`;
    },
    getFallbackUrl: (username: string, amount?: number) => {
      return amount
        ? `https://paypal.me/${username}/${amount}`
        : `https://paypal.me/${username}`;
    },
  },
  {
    id: 'zelle',
    name: 'Zelle',
    color: '#6D1ED4',
    icon: 'Z',
    supportsAmount: false,
    getUrl: null, // Zelle doesn't have direct links
    getFallbackUrl: null,
  },
];

const GroupDonationScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const {initPaymentSheet, presentPaymentSheet} = useStripe();
  const customerId = useSelector(selectUserData)?.customerId;

  // State
  const [amount, setAmount] = useState('10');
  const [selectedExternalAmount, setSelectedExternalAmount] =
    useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [donationId, setDonationId] = useState<string | null>(null);
  const [showStripeOption, setShowStripeOption] = useState(false);

  // Confirmation modal state for external payments
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<
    string | null
  >(null);
  const [confirmationAmount, setConfirmationAmount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [savingDonation, setSavingDonation] = useState(false);
  const appState = useRef(AppState.currentState);
  const openedExternalApp = useRef(false);

  const paymentLinks = group?.paymentLinks;
  const hasPaymentLinks =
    paymentLinks?.venmo ||
    paymentLinks?.cashApp ||
    paymentLinks?.paypal ||
    paymentLinks?.zelle;
  const hasStripe = !!group?.stripeConnectAccountId;

  // Listen for app returning to foreground after external payment
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active' &&
          openedExternalApp.current
        ) {
          // User returned from external payment app
          openedExternalApp.current = false;
          // Show confirmation modal after short delay
          setTimeout(() => {
            setShowConfirmationModal(true);
          }, 500);
        }
        appState.current = nextAppState;
      },
    );

    return () => subscription.remove();
  }, []);

  // Handle opening payment app
  const handlePaymentLink = async (
    methodId: string,
    value: string | undefined,
  ) => {
    if (!value) return;

    const method = PAYMENT_METHODS.find(m => m.id === methodId);
    if (!method) return;

    // Track payment method for confirmation and pre-fill amount
    setPendingPaymentMethod(method.name);
    setConfirmationAmount(selectedExternalAmount.toString());

    // Special handling for Zelle (no deep link)
    if (methodId === 'zelle') {
      Alert.alert(
        'Send via Zelle',
        `Open your banking app and send $${selectedExternalAmount} to:\n\n${value}\n\nInclude "${groupName}" in the memo.`,
        [
          {text: 'Copy Info', onPress: () => copyToClipboard(value)},
          {
            text: 'I Sent It',
            onPress: () => {
              setShowConfirmationModal(true);
            },
          },
          {text: 'Cancel', style: 'cancel'},
        ],
      );
      return;
    }

    try {
      // Build URL with amount and group name where supported
      const url = method.getUrl!(value, selectedExternalAmount, groupName);
      const canOpen = await Linking.canOpenURL(url);

      // Mark that we're opening external app
      openedExternalApp.current = true;

      if (canOpen) {
        await Linking.openURL(url);
      } else if (method.getFallbackUrl) {
        // Open web fallback with amount
        await Linking.openURL(
          method.getFallbackUrl(value, selectedExternalAmount),
        );
      }
    } catch (err) {
      console.error('Error opening payment link:', err);
      openedExternalApp.current = false;
      if (method.getFallbackUrl) {
        openedExternalApp.current = true;
        await Linking.openURL(
          method.getFallbackUrl(value, selectedExternalAmount),
        );
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      const Clipboard = require('@react-native-community/clipboard').default;
      Clipboard.setString(text);
      Alert.alert('Copied!', 'Payment info copied to clipboard');
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  // Handle confirming external donation
  const handleConfirmExternalDonation = async () => {
    const donationAmount = parseFloat(confirmationAmount);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid donation amount.');
      return;
    }

    setSavingDonation(true);
    try {
      const currentUser = auth().currentUser;
      await dispatch(
        addExternalDonation({
          groupId,
          amount: donationAmount,
          paymentMethod: pendingPaymentMethod || 'External',
          donorName: isAnonymous
            ? undefined
            : currentUser?.displayName || undefined,
          donorId: isAnonymous ? undefined : currentUser?.uid,
          isAnonymous,
        }),
      ).unwrap();

      setShowConfirmationModal(false);
      setConfirmationAmount('');
      setPendingPaymentMethod(null);
      setIsAnonymous(true);
      setSuccess(true);
      setAmount(confirmationAmount);

      setTimeout(() => {
        navigation.goBack();
      }, 2000);
    } catch (err: any) {
      console.error('Error recording donation:', err);
      Alert.alert(
        'Error',
        err.message || 'Failed to record donation. Please try again.',
      );
    } finally {
      setSavingDonation(false);
    }
  };

  const handleSkipConfirmation = () => {
    setShowConfirmationModal(false);
    setConfirmationAmount('');
    setPendingPaymentMethod(null);
    setIsAnonymous(true);
  };

  // Stripe payment handling
  const fetchPaymentIntentClientSecret = async () => {
    setLoading(true);
    setError(null);
    try {
      const amountInCents = parseInt(amount, 10) * 100;
      if (isNaN(amountInCents) || amountInCents < 50) {
        setError('Minimum donation is $0.50');
        setLoading(false);
        return null;
      }

      const createPaymentIntent = functions().httpsCallable<
        unknown,
        {clientSecret?: string; donationId?: string}
      >('createStripePaymentIntent');
      const response = await createPaymentIntent({
        groupId,
        amount: amountInCents,
      });

      const secret = response?.data?.clientSecret as string | undefined;
      const newDonationId = response?.data?.donationId as string | undefined;

      if (!secret || !newDonationId) {
        throw new Error('Failed to get payment details from server.');
      }

      setDonationId(newDonationId);
      return {secret, donationId: newDonationId};
    } catch (error: any) {
      console.error('Error fetching Payment Intent:', error);
      setError(
        error.message || 'Could not initiate donation. Please try again.',
      );
      setLoading(false);
      return null;
    }
  };

  const handleDonationSuccess = (currentDonationId: string) => {
    if (!currentDonationId) {
      console.error('No donation ID available for completion');
      setError('Error completing donation: Missing donation ID');
      setLoading(false);
      return;
    }

    setLoading(false);
    setSuccess(true);
    dispatch(
      completeDonation({
        groupId,
        amount: parseInt(amount, 10),
        donationId: currentDonationId,
      }),
    );
    setDonationId(null);
    setAmount('10');
    setTimeout(() => {
      navigation.goBack();
    }, 2000);
  };

  // Deep link handling for Stripe redirects
  useEffect(() => {
    const handleDeepLink = (event: {url: string}) => {
      if (event.url.includes('stripe-redirect')) {
        const {params} = parseDeepLinkUrl(event.url);
        const status = params['redirect_status'];

        if (status === 'succeeded') {
          handleDonationSuccess(donationId!);
        } else {
          setError('Payment was cancelled or failed. Please try again.');
          setLoading(false);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [dispatch, groupId, amount, donationId, navigation]);

  const handleStripePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchPaymentIntentClientSecret();
      if (!result) {
        setLoading(false);
        return;
      }

      const {secret, donationId: currentDonationId} = result;

      const {error: initError} = await initPaymentSheet({
        merchantDisplayName: 'Homegroups',
        customerId: customerId,
        paymentIntentClientSecret: secret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'homegroups-app://stripe-redirect',
        defaultBillingDetails: {},
      });

      if (initError) {
        setError(`Error initializing payment: ${initError.message}`);
        setLoading(false);
        return;
      }

      const {error: presentError} = await presentPaymentSheet();

      if (presentError) {
        setError(`Payment Error: ${presentError.message}`);
        setLoading(false);
      } else {
        handleDonationSuccess(currentDonationId);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during payment');
      setLoading(false);
    }
  };

  const handleAmountChange = (text: string) => {
    setError(null);
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue === '' || parseInt(numericValue, 10) >= 0) {
      setAmount(numericValue);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.successContainer}>
          <Icon name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>Thank You!</Text>
          <Text style={styles.successText}>
            Your donation of ${amount} has been processed successfully.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // If showing Stripe payment form
  if (showStripeOption && hasStripe) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowStripeOption(false)}>
              <Icon name="arrow-left" size={20} color="#2196F3" />
              <Text style={styles.backButtonText}>Back to options</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Icon name="credit-card" size={48} color="#2196F3" />
              <Text style={styles.title}>Pay with Card</Text>
              <Text style={styles.subtitle}>Donate to {groupName}</Text>
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.label}>Donation Amount ($)</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10"
                  value={amount}
                  onChangeText={handleAmountChange}
                  keyboardType="numeric"
                  testID="donation-amount-input"
                />
                <Text style={styles.currencyCode}>USD</Text>
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.stripeButton, loading && styles.disabledButton]}
                onPress={handleStripePayment}
                disabled={loading || !amount || parseInt(amount, 10) < 1}
                testID="stripe-payment-button">
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.stripeButtonText}>
                    Pay ${amount || '0'}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.infoText}>
                Secure payment processing powered by Stripe.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Main screen with payment options
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>💝</Text>
          <Text style={styles.title}>Donate to {groupName}</Text>
          <Text style={styles.subtitle}>Support the 7th Tradition</Text>
        </View>

        {/* Payment Link Options */}
        {hasPaymentLinks && (
          <View style={styles.paymentLinksContainer}>
            <Text style={styles.sectionTitle}>Select amount</Text>

            {/* Amount Selection Chips */}
            <View style={styles.amountChipsContainer}>
              {SUGGESTED_AMOUNTS.map(amt => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.amountChip,
                    selectedExternalAmount === amt && styles.amountChipSelected,
                  ]}
                  onPress={() => setSelectedExternalAmount(amt)}>
                  <Text
                    style={[
                      styles.amountChipText,
                      selectedExternalAmount === amt &&
                        styles.amountChipTextSelected,
                    ]}>
                    ${amt}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.amountChip,
                  styles.amountChipCustom,
                  !SUGGESTED_AMOUNTS.includes(selectedExternalAmount) &&
                    styles.amountChipSelected,
                ]}
                onPress={() => {
                  Alert.prompt(
                    'Custom Amount',
                    'Enter donation amount',
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'OK',
                        onPress: (value?: string) => {
                          const num = parseInt(value || '0', 10);
                          if (num > 0) {
                            setSelectedExternalAmount(num);
                          }
                        },
                      },
                    ],
                    'plain-text',
                    selectedExternalAmount.toString(),
                    'number-pad',
                  );
                }}>
                <Text
                  style={[
                    styles.amountChipText,
                    !SUGGESTED_AMOUNTS.includes(selectedExternalAmount) &&
                      styles.amountChipTextSelected,
                  ]}>
                  {SUGGESTED_AMOUNTS.includes(selectedExternalAmount)
                    ? 'Other'
                    : `$${selectedExternalAmount}`}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, {marginTop: 20}]}>
              Choose how to donate
            </Text>

            {paymentLinks?.venmo && (
              <TouchableOpacity
                style={[styles.paymentButton, {backgroundColor: '#008CFF'}]}
                onPress={() => handlePaymentLink('venmo', paymentLinks.venmo)}
                testID="venmo-button">
                <View style={styles.paymentButtonIcon}>
                  <Text style={styles.paymentButtonIconText}>V</Text>
                </View>
                <View style={styles.paymentButtonContent}>
                  <Text style={styles.paymentButtonTitle}>
                    Pay ${selectedExternalAmount} with Venmo
                  </Text>
                  <Text style={styles.paymentButtonSubtitle}>
                    @{paymentLinks.venmo}
                  </Text>
                </View>
                <Icon name="chevron-right" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {paymentLinks?.cashApp && (
              <TouchableOpacity
                style={[styles.paymentButton, {backgroundColor: '#00D632'}]}
                onPress={() =>
                  handlePaymentLink('cashApp', paymentLinks.cashApp)
                }
                testID="cashapp-button">
                <View style={styles.paymentButtonIcon}>
                  <Text style={styles.paymentButtonIconText}>$</Text>
                </View>
                <View style={styles.paymentButtonContent}>
                  <Text style={styles.paymentButtonTitle}>
                    Pay ${selectedExternalAmount} with Cash App
                  </Text>
                  <Text style={styles.paymentButtonSubtitle}>
                    ${paymentLinks.cashApp}
                  </Text>
                </View>
                <Icon name="chevron-right" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {paymentLinks?.paypal && (
              <TouchableOpacity
                style={[styles.paymentButton, {backgroundColor: '#003087'}]}
                onPress={() => handlePaymentLink('paypal', paymentLinks.paypal)}
                testID="paypal-button">
                <View style={styles.paymentButtonIcon}>
                  <Text style={styles.paymentButtonIconText}>P</Text>
                </View>
                <View style={styles.paymentButtonContent}>
                  <Text style={styles.paymentButtonTitle}>
                    Pay ${selectedExternalAmount} with PayPal
                  </Text>
                  <Text style={styles.paymentButtonSubtitle}>
                    paypal.me/{paymentLinks.paypal}
                  </Text>
                </View>
                <Icon name="chevron-right" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {paymentLinks?.zelle && (
              <TouchableOpacity
                style={[styles.paymentButton, {backgroundColor: '#6D1ED4'}]}
                onPress={() => handlePaymentLink('zelle', paymentLinks.zelle)}
                testID="zelle-button">
                <View style={styles.paymentButtonIcon}>
                  <Text style={styles.paymentButtonIconText}>Z</Text>
                </View>
                <View style={styles.paymentButtonContent}>
                  <Text style={styles.paymentButtonTitle}>
                    Send ${selectedExternalAmount} via Zelle
                  </Text>
                  <Text style={styles.paymentButtonSubtitle}>
                    {paymentLinks.zelle}
                  </Text>
                </View>
                <Icon name="chevron-right" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Stripe option */}
        {hasStripe && (
          <View style={styles.stripeOptionContainer}>
            {hasPaymentLinks && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            <TouchableOpacity
              style={styles.stripeOptionButton}
              onPress={() => setShowStripeOption(true)}
              testID="stripe-option-button">
              <Icon name="credit-card-outline" size={24} color="#2196F3" />
              <Text style={styles.stripeOptionText}>Pay with Credit Card</Text>
              <Icon name="chevron-right" size={20} color="#9E9E9E" />
            </TouchableOpacity>
          </View>
        )}

        {/* Info footer */}
        <View style={styles.footer}>
          <Icon name="shield-check-outline" size={16} color="#9E9E9E" />
          <Text style={styles.footerText}>
            Your contribution helps cover group expenses like rent and
            literature.
          </Text>
        </View>
      </ScrollView>

      {/* Donation Confirmation Modal */}
      <Modal
        visible={showConfirmationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleSkipConfirmation}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Icon name="check-circle-outline" size={48} color="#4CAF50" />
              <Text style={styles.modalTitle}>
                Did you complete your donation?
              </Text>
              <Text style={styles.modalSubtitle}>
                {pendingPaymentMethod
                  ? `Via ${pendingPaymentMethod} to ${groupName}`
                  : `To ${groupName}`}
              </Text>
            </View>

            <Text style={styles.modalLabel}>How much did you donate?</Text>
            <View style={styles.modalAmountContainer}>
              <Text style={styles.modalCurrencySymbol}>$</Text>
              <TextInput
                style={styles.modalAmountInput}
                placeholder="0"
                value={confirmationAmount}
                onChangeText={setConfirmationAmount}
                keyboardType="decimal-pad"
                autoFocus={true}
                testID="confirmation-amount-input"
              />
            </View>

            {/* Anonymous Toggle */}
            <TouchableOpacity
              style={styles.anonymousToggle}
              onPress={() => setIsAnonymous(!isAnonymous)}
              activeOpacity={0.7}>
              <View
                style={[
                  styles.checkbox,
                  isAnonymous && styles.checkboxChecked,
                ]}>
                {isAnonymous && <Icon name="check" size={14} color="#FFFFFF" />}
              </View>
              <View style={styles.anonymousToggleContent}>
                <Text style={styles.anonymousToggleLabel}>
                  Make my donation anonymous
                </Text>
                <Text style={styles.anonymousToggleHint}>
                  {isAnonymous
                    ? 'Your name will not be shown'
                    : 'Your name will appear in the treasury'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.modalNote}>
              <Icon name="information-outline" size={16} color="#757575" />
              <Text style={styles.modalNoteText}>
                This will be recorded in the group's treasury as a self-reported
                donation.
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalSkipButton}
                onPress={handleSkipConfirmation}
                disabled={savingDonation}>
                <Text style={styles.modalSkipButtonText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (!confirmationAmount || savingDonation) &&
                    styles.modalConfirmButtonDisabled,
                ]}
                onPress={handleConfirmExternalDonation}
                disabled={!confirmationAmount || savingDonation}>
                {savingDonation ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Icon name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.modalConfirmButtonText}>
                      Yes, Record It
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 16,
  },
  headerEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  paymentLinksContainer: {
    marginBottom: 24,
  },
  amountChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  amountChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  amountChipSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  amountChipCustom: {
    paddingHorizontal: 16,
  },
  amountChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#616161',
  },
  amountChipTextSelected: {
    color: '#2196F3',
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  paymentButtonIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  paymentButtonContent: {
    flex: 1,
  },
  paymentButtonTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  paymentButtonSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  stripeOptionContainer: {
    marginBottom: 24,
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
  stripeOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  stripeOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 'auto',
    paddingTop: 24,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: '#9E9E9E',
    marginLeft: 8,
    lineHeight: 18,
  },
  // Stripe payment form styles
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButtonText: {
    color: '#2196F3',
    fontSize: 16,
    marginLeft: 8,
  },
  formContainer: {
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#757575',
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#212121',
  },
  currencyCode: {
    fontSize: 16,
    color: '#BDBDBD',
    marginLeft: 8,
  },
  stripeButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  stripeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.7,
  },
  infoText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
  },
  // Confirmation Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 12,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  modalAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalCurrencySymbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#757575',
    marginRight: 8,
  },
  modalAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: 'bold',
    color: '#212121',
    paddingVertical: 16,
  },
  anonymousToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  anonymousToggleContent: {
    flex: 1,
  },
  anonymousToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  anonymousToggleHint: {
    fontSize: 13,
    color: '#757575',
  },
  modalNote: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  modalNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#757575',
    marginLeft: 8,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSkipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  modalSkipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  modalConfirmButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    gap: 8,
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default GroupDonationScreen;
