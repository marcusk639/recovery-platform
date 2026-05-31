import React from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAppDispatch, useAppSelector } from '../../state/store';
import { houseKeys } from '../../state/queries/houseQueries';
import { logout } from '../../state/slices/userSlice';
import { RatsLogo } from '../../components/rats-logo/rats-logo';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { color, fontSize, normalize } from '../../styles/theme';
import { logException } from '../../util/logging';

const WEB_PORTAL_URL =
  (process.env.RATS_WEB_URL as string | undefined) ??
  'https://regroup-app.com/billing';

/**
 * Shown to operators (admin / superAdmin) whose subscription has lapsed.
 *
 * Provides three actions:
 *  1. "Manage Subscription" — opens the billing portal in the browser
 *  2. "I've subscribed"     — invalidates React Query user cache so the
 *                             gate re-evaluates without requiring a restart
 *  3. "Sign out"            — dispatches the logout thunk
 */
const SubscriptionRequiredScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const currentUser = useAppSelector(s => s.user.user);

  const handleManageSubscription = async () => {
    try {
      const canOpen = await Linking.canOpenURL(WEB_PORTAL_URL);
      if (canOpen) {
        await Linking.openURL(WEB_PORTAL_URL);
      }
    } catch (error) {
      logException(error);
    }
  };

  const handleRefreshSubscription = () => {
    // Invalidate user and house caches so the gate re-evaluates
    if (currentUser?.id) {
      queryClient.invalidateQueries({ queryKey: ['user', currentUser.id] });
    }
    if (currentUser?.houseId) {
      queryClient.invalidateQueries({
        queryKey: houseKeys.detail(currentUser.houseId),
      });
    }
    queryClient.invalidateQueries({ queryKey: ['paywall', 'config'] });
  };

  const handleSignOut = () => {
    dispatch(logout());
  };

  return (
    <View style={styles.container}>
      <RatsLogo imageStyle={styles.logo} />

      <RatsText
        translate={false}
        text="Your subscription has ended"
        style={styles.title}
      />

      <RatsText
        translate={false}
        text="To continue managing your house, renew your subscription on the RATS web portal."
        style={styles.body}
      />

      <RatsButton
        title="Manage Subscription"
        onPress={handleManageSubscription}
        containerStyle={styles.primaryButton}
      />

      <RatsButton
        title="I've Subscribed"
        onPress={handleRefreshSubscription}
        light
        containerStyle={styles.secondaryButton}
      />

      <RatsText
        translate={false}
        text="Sign out"
        style={styles.signOutLink}
        onPress={handleSignOut}
      />
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
  logo: {
    width: normalize(80),
    height: normalize(80),
    marginBottom: normalize(24),
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
    marginBottom: normalize(32),
    lineHeight: normalize(22),
  },
  primaryButton: {
    width: '100%',
    height: normalize(48),
    marginBottom: normalize(12),
  },
  secondaryButton: {
    width: '100%',
    height: normalize(48),
    marginBottom: normalize(24),
    borderWidth: 1,
    borderColor: color.baby_blue,
  },
  signOutLink: {
    fontSize: fontSize.regular,
    color: color.baby_blue,
    textDecorationLine: 'underline',
  },
});

export default SubscriptionRequiredScreen;
