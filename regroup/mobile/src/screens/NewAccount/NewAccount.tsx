import React, { useState, useCallback, useEffect, useRef } from 'react';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { RatsText } from '../../components/rats-text';
import styles from './NewAccountStyles';
import NewAccountForm from './NewAccountForm';
import { User } from '../../entities/User';
import { logout } from '../../state/slices/userSlice';
import RatsButton from '../../components/rats-button/rats-button';

import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { Invitation } from '../../entities/Invite';
import RatsScrollView from '../../components/rats-scroll-view';
import { SCROLL_CONTAINER } from '../../styles/theme';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import { AuthScreenNavigationProp } from '../../navigation/types';
import { ReactNativeFirebase } from '@react-native-firebase/app';
import { useAppSelector, useAppDispatch } from '../../state/store';

interface Props {
  navigation: AuthScreenNavigationProp;
}

/**
 * New Account Screen
 *
 * Collects user profile information after account creation.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (userActions)
 * - Added RTK import: logout from userSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 4 selectors to use state.user (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (.unwrap() for error handling)
 * - HOCs kept for Phase 3 removal
 */
const NewAccount: React.FC<Props> = props => {
  const { navigation } = props;

  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const updating = useAppSelector(state => state.user.updating);
  const error = useAppSelector(state => state.user.error);
  const invitation = useAppSelector(state => state.user.invitation);

  const userSubscriptionRef = useRef<(() => void) | null>(null);

  const signOut = useCallback(async () => {
    try {
      await dispatch(logout()).unwrap();
    } catch (error) {
      // do something
    }
  }, [dispatch]);

  useEffect(() => {
    // Email verification removed - no longer needed
  }, []);

  useEffect(() => {
    return () => {
      if (userSubscriptionRef.current) {
        userSubscriptionRef.current();
      }
    };
  }, []);

  if (error?.nativeFirebaseError) {
    error.message = error.nativeErrorMessage;
  }
  // if (updating) {
  //   return <RatsLoadingIndicator />;
  // }
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        <View style={styles.innerContainer}>
          {error && <RatsText style={{ color: 'red' }} text={error.message} />}
          {/* Email verification removed */}
          <>
            <ScreenHeader icon={<HelpIcon />} header="About You" />
            <NewAccountForm navigation={navigation} />
          </>
        </View>
      </RatsScrollView>
    </SafeAreaView>
  );
};

export default NewAccount;
