import React, { useCallback, useState } from 'react';
import { View, Linking, StyleSheet, ActivityIndicator } from 'react-native';
import { RatsText } from '../../components/rats-text';
import {
  CARD_STYLE,
  color,
  normalize,
  HEADER,
  fontSize,
  SAVE_BUTTON,
  fontFamily,
} from '../../styles/theme';
import { RatsIcon } from '../../components/rats-icon';
import { logout } from '../../state/slices/userSlice';
import RatsButton from '../../components/rats-button/rats-button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logException } from '../../util/logging';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppDispatch } from '../../state/store';
import { WEB_BASE_URL } from '../Subscription/SubscriptionRequiredScreen';

interface Props {
  closeModal: () => any;
  status: string;
  setModalShowing: (showing: boolean) => void;
  isGuest: boolean;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Maps subscription status codes to user-friendly copy.
 */
const STATUS_COPY: Record<
  string,
  {
    header: string;
    description: string;
    icon: string;
    iconColor: string;
    primaryAction?: string;
  }
> = {
  cancelled: {
    header: 'Subscription Inactive',
    description:
      'Your subscription has been cancelled. Visit your account to reactivate and restore full access.',
    icon: 'times-circle',
    iconColor: color.red,
    primaryAction: 'Reactivate Subscription',
  },
  payment_failed: {
    header: 'Payment Failed',
    description:
      'We were unable to process your last payment. Please update your payment method to continue using the app.',
    icon: 'credit-card',
    iconColor: color.red,
    primaryAction: 'Update Payment Method',
  },
  expired: {
    header: 'Subscription Expired',
    description: 'Your subscription period has ended. Please renew your plan to regain access.',
    icon: 'clock',
    iconColor: color.orange,
    primaryAction: 'Renew Subscription',
  },
};

const FALLBACK_COPY = {
  header: 'Subscription Issue',
  description:
    'There is a problem with your subscription. Please visit your account page to resolve it.',
  icon: 'exclamation-triangle',
  iconColor: color.red,
  primaryAction: 'Fix Subscription',
};

// Built from WEB_BASE_URL so a staging/dev build does not send a lapsed
// operator to the production billing page. Hardcoding the host here ignored
// RATS_WEB_URL, unlike the paywall screen's own deep link.
const ACCOUNT_URL = `${WEB_BASE_URL}/my-account`;

/**
 * Subscription Update Modal
 *
 * Displays subscription issues with user-friendly messaging and allows the
 * user to open their account page or sign out.
 */
const SubscriptionUpdateModal: React.FC<Props> = (props) => {
  const { status, isGuest } = props;

  const dispatch = useAppDispatch();
  const [signingOut, setSigningOut] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const copy = isGuest
    ? {
        header: 'Subscription Issue',
        description:
          "There is a problem with your house's subscription. Please ask the house manager to resolve it.",
        icon: 'exclamation-triangle',
        iconColor: color.orange,
      }
    : (STATUS_COPY[status] ?? FALLBACK_COPY);

  const goToAccount = useCallback(async () => {
    setLinkError(null);
    try {
      const supported = await Linking.canOpenURL(ACCOUNT_URL);
      if (supported) {
        await Linking.openURL(ACCOUNT_URL);
      } else {
        setLinkError(`Unable to open browser. Please visit ${ACCOUNT_URL}.`);
      }
    } catch {
      setLinkError(`Unable to open browser. Please visit ${ACCOUNT_URL}.`);
      logException('Could not open account URL');
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await dispatch(logout()).unwrap();
    } catch (error: any) {
      logException(error, 'Error signing out');
    } finally {
      setSigningOut(false);
    }
  }, [dispatch]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        {/* Status icon */}
        <RatsIcon
          name={copy.icon}
          size={normalize(80)}
          style={{ color: copy.iconColor }}
          testID="subscription-status-icon"
        />

        {/* Header */}
        <RatsText text={copy.header} style={styles.header} testID="subscription-status-header" />

        {/* Description */}
        <RatsText
          style={styles.description}
          text={copy.description}
          testID="subscription-status-description"
        />

        {/* Link error message */}
        {linkError ? (
          <RatsText
            translate={false}
            text={linkError}
            style={styles.errorText}
            testID="subscription-link-error"
          />
        ) : null}

        {/* Primary CTA — only for account holders */}
        {!isGuest && (
          <RatsButton
            onPress={goToAccount}
            title={copy.primaryAction ?? 'Go to My Account'}
            containerStyle={styles.primaryButton}
            testID="subscription-go-to-account"
          />
        )}
      </View>

      {/* Sign-out button */}
      <View style={styles.signOutContainer}>
        {signingOut ? (
          <ActivityIndicator
            size="small"
            color={color.baby_blue}
            testID="subscription-signout-loading"
          />
        ) : (
          <RatsButton
            onPress={handleSignOut}
            title="Sign Out"
            light
            disabled={signingOut}
            containerStyle={styles.signOutButton}
            testID="subscription-sign-out"
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.white,
    paddingHorizontal: normalize(15),
  },
  card: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: color.white,
    ...CARD_STYLE,
    marginBottom: 0,
    paddingHorizontal: 0,
    paddingBottom: normalize(20),
    alignItems: 'center',
  },
  header: {
    ...HEADER,
    marginLeft: 0,
    alignSelf: 'center',
    textAlign: 'center',
  },
  description: {
    color: color.dark_grey,
    fontSize: fontSize.medium,
    marginBottom: normalize(10),
    textAlign: 'center',
    paddingHorizontal: normalize(10),
  },
  errorText: {
    color: color.red,
    fontSize: fontSize.small,
    marginTop: normalize(8),
    textAlign: 'center',
    paddingHorizontal: normalize(10),
  },
  primaryButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.baby_blue,
    marginTop: normalize(20),
    borderColor: color.baby_blue,
    paddingHorizontal: normalize(20),
    minWidth: normalize(220),
  },
  signOutContainer: {
    alignItems: 'center',
    marginBottom: normalize(30),
    minHeight: normalize(50),
    justifyContent: 'center',
  },
  signOutButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.white,
    alignSelf: 'center',
    borderColor: color.baby_blue,
    minWidth: normalize(220),
  },
});

export default SubscriptionUpdateModal;
