import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { logout } from '../../state/slices/userSlice';
import { RatsText } from '../rats-text';
import RatsButton from '../rats-button/rats-button';
import { color, fontSize, normalize } from '../../styles/theme';
import { Routes } from '../../navigation/types';

/**
 * Shown by SubscriptionGate (grace_expired) to a resident whose house is
 * blocked: its operator's plan is required or lapsed past the grace period.
 * They can't fix it, but they keep read-only access to their own data (owner
 * decision, launch spec §4.1 item 2): their payment history (receipts and CSV
 * export) and their own documents. Nothing else of the app is reachable; the
 * two screens are modal routes, and neither is in the linking config.
 *
 * Both buttons need the resident's own guest record (selected at sign-in), so
 * they show only once it has loaded and is linked to this account.
 */
const ResidentLimitedView: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const userId = useAppSelector((s) => s.user.user?.id);
  const { house } = useSelectedHouse();
  const { guest } = useSelectedGuest();

  const ownRecord = !!house?.id && !!guest?.id && !!userId && guest.userId === userId;

  const openPaymentHistory = () => navigation.navigate(Routes.PaymentHistory);
  const openDocuments = () =>
    navigation.navigate(Routes.Documents, {
      houseId: house!.id,
      guestId: guest!.id,
      title: 'My Documents',
    });

  return (
    <View testID="resident-limited-view" style={styles.container}>
      <RatsText translate={false} text="Access temporarily unavailable" style={styles.title} />
      <RatsText
        translate={false}
        text="Your house manager's account is inactive. Contact them to restore access. You can still see your payment history and your documents."
        style={styles.body}
      />
      {house?.phoneNumber ? (
        <RatsText translate={false} text={house.phoneNumber} style={styles.contactInfo} />
      ) : null}

      {ownRecord && (
        <>
          <RatsButton
            testID="limited-payment-history"
            title="Payment History"
            onPress={openPaymentHistory}
            containerStyle={styles.button}
          />
          <RatsButton
            testID="limited-documents"
            title="My Documents"
            onPress={openDocuments}
            light
            containerStyle={styles.button}
          />
        </>
      )}

      {/* RatsText drops testID, so the touch target carries it. */}
      <TouchableOpacity testID="limited-sign-out" onPress={() => dispatch(logout())}>
        <RatsText translate={false} text="Sign out" style={styles.signOutLink} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    paddingHorizontal: normalize(24),
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: '700' as const,
    textAlign: 'center',
    color: color.black,
    marginBottom: normalize(12),
  },
  body: {
    fontSize: fontSize.regular,
    textAlign: 'center',
    color: color.dark_grey,
    marginBottom: normalize(16),
    lineHeight: normalize(22),
  },
  contactInfo: {
    fontSize: fontSize.regular_medium,
    color: color.baby_blue,
    textAlign: 'center',
    marginBottom: normalize(24),
  },
  button: {
    width: '100%',
    height: normalize(48),
    marginBottom: normalize(12),
  },
  signOutLink: {
    fontSize: fontSize.regular,
    color: color.baby_blue,
    textDecorationLine: 'underline',
    marginTop: normalize(8),
  },
});

export default ResidentLimitedView;
