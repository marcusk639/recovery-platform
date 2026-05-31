/**
 * UserInfo - Migrated to Redux Toolkit
 *
 * Changes from original:
 * - Class component -> Functional component
 * - Uses useState and useEffect hooks
 * - Uses RTK slices (state.user, state.guests, state.houses)
 * - Uses React Query mutation for deleteGuest
 * - Removed connect() HOC
 *
 * Phase 3.3: Migrated from 3 HOC layers to Context hooks
 * - Removed: withNotifier, withLoadingModal, withPopover
 * - Added: useModal, useNotification hooks
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, SafeAreaView, Alert } from 'react-native';
import map from 'lodash/map';

// Hooks
import { useDeleteGuest } from '../../state/queries';
import { useAppSelector } from '../../state/store';
import { useGuests } from '../../state/queries/guestQueries';
import { useModal, useNotification } from '../../context';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';

// Components
import RatsScrollView from '../../components/rats-scroll-view';
import RatsAvatar from '../../components/rats-avatar';
import { RatsText } from '../../components/rats-text';
import { ClickableIcon } from '../../components/rats-icon';
import BoxedIcon from '../../components/rats-icon/boxed-icon';
import RatsButton from '../../components/rats-button/rats-button';
import Can from '../../components/auth/can';
import { AuthConsumer } from '../../context/auth';

// Types
import { Guest } from '../../entities/Guest';
import Admin from '../../entities/Admin';
import { User } from '../../entities/User';
import { House } from '../../entities/House';
import { Guests } from '../../types';
import { RoleToken } from '../../components/auth/auth';

// Utils
import {
  CARD_STYLE,
  ROW,
  normalize,
  color,
  fontSize,
} from '../../styles/theme';
import { formatName } from '../../util/display';
import { isAdmin, isSameUser } from '../../util/roles';
import { isDemo } from '../../util/user';

// Navigation
import { Routes, RootStackParamList } from '../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * UserInfo Component
 */
const UserInfo: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 3 HOC layers)
  const { setLoadingModalState } = useModal();
  const {
    notify,
    notificationVisible: notifierOpen,
    showPopover,
  } = useNotification();
  // Local state for delete operation
  const [deleting, setDeleting] = useState(false);
  const [deletingSuccessful, setDeletingSuccessful] = useState(false);
  const [deletingFailed, setDeletingFailed] = useState(false);

  // Get data from RTK slices
  const { guest } = useSelectedGuest();
  const user = useAppSelector(state => state.user.user);
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guestsData = {} } = useGuests(house?.id ?? '');
  const guests = guestsData as Guests;
  // React Query mutation for delete (optional, can use legacy action)
  const deleteGuestMutation = useDeleteGuest();

  // The previous updating-house success/failure effect selected from
  // state.houses.updatingHouse* — fields that no longer exist in the slice
  // (removed in the Phase C slice cleanup). It never fired in practice, so
  // the notification after a save was silently dropped. If a success toast
  // is wanted here, wire it through the relevant RQ mutation's onSuccess.

  // Handle loading modal state
  useEffect(() => {
    setLoadingModalState(
      deleting,
      deletingSuccessful,
      'Removing Guest...',
      deletingFailed ? 'Something went wrong' : null,
    );
  }, [deleting, deletingSuccessful, deletingFailed, setLoadingModalState]);

  // Remove guest handler
  const removeGuest = useCallback(() => {
    if (!guest || !house) return;

    if (user && isDemo(user.email || '')) {
      showPopover(
        'Remove Guest',
        'This functionality is disabled in demo mode.',
      );
      return;
    }

    Alert.alert(
      'Confirm Removal',
      'Are you sure you want to remove this guest from the house?',
      [
        { text: 'Cancel', onPress: () => null },
        {
          text: 'Continue',
          onPress: async () => {
            setDeleting(true);
            setDeletingFailed(false);
            setDeletingSuccessful(false);

            try {
              // Use React Query mutation
              await deleteGuestMutation.mutateAsync({ guest, house });

              setDeleting(false);
              setDeletingSuccessful(true);
              setDeletingFailed(false);
              navigation.goBack();
            } catch (error) {
              setDeleting(false);
              setDeletingFailed(true);
              setDeletingSuccessful(false);
            }
          },
        },
      ],
    );
  }, [guest, house, user, deleteGuestMutation, navigation, showPopover]);

  // Render sections
  const renderSections = (token: RoleToken) => {
    if (!guest || !house || !user) return null;

    const sections = {
      Phone: {
        value: guest.phoneNumber,
        icon: 'phone',
        iconColor: color.medium_grey,
      },
      Email: {
        value: guest.email,
        icon: 'envelope',
        iconColor: color.medium_grey,
      },
      Role: {
        value: guest.isAdmin ? 'Guest-Administrator' : 'Guest',
        icon: 'user-tag',
        iconColor: color.medium_grey,
      },
      Phase: {
        value: guest.phase === guest.id ? 'Custom' : guest.phase,
        icon: 'clipboard-list',
        action: isAdmin(token, house.id)
          ? isDemo(user.email || '')
            ? () =>
                showPopover(
                  'Change Phase',
                  'This functionality is disabled in demo mode.',
                )
            : () => navigation.navigate(Routes.PhaseCustomization)
          : null,
        buttonLabel: isAdmin(token, house.id) ? 'Change Phase' : null,
        iconColor: color.medium_grey,
      },
    };

    return map(sections, (section, key) => {
      return (
        <View key={key} style={[CARD_STYLE, { marginTop: normalize(5) }]}>
          <View style={[ROW]}>
            <BoxedIcon
              container={{ marginRight: normalize(10) } as any}
              iconColor={color.light_black}
              backgroundColor={section.iconColor}
              name={section.icon as any}
              iconSize={normalize(22) as any}
            />
            <View>
              <RatsText
                text={key}
                style={{
                  color: color.dark_grey,
                  fontSize: fontSize.regular_medium,
                }}
              />
              <RatsText
                text={section.value}
                style={{ fontSize: fontSize.regular_medium }}
              />
            </View>
          </View>
          {(section as any).action && (
            <RatsButton
              title={(section as any).buttonLabel}
              onPress={(section as any).action}
              light
              containerStyle={{ marginTop: normalize(10) }}
            />
          )}
        </View>
      );
    });
  };

  // Early return if no guest
  if (!guest || !user || !house) {
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AuthConsumer>
        {({ token }) => (
          <RatsScrollView
            contentContainerStyle={{
              flexGrow: 1,
              backgroundColor: color.light_grey,
            }}>
            <View style={[CARD_STYLE, ROW, { padding: normalize(20) }]}>
              <ClickableIcon
                containerProps={{
                  onPress: () => navigation.goBack(),
                  style: {
                    position: 'absolute',
                    top: normalize(20),
                    left: normalize(20),
                    zIndex: 50,
                  },
                }}
                iconProps={{
                  size: normalize(25),
                  name: 'arrow-left',
                  style: { color: color.baby_blue },
                }}
              />
              <View style={{ flex: 1 }}>
                <View style={{ alignSelf: 'center' }}>
                  <RatsAvatar
                    name={formatName(guest.firstName, guest.lastName)}
                    style={{
                      height: normalize(90),
                      width: normalize(90),
                      borderRadius: normalize(45),
                      alignSelf: 'center',
                    }}
                    source={{ uri: guest.avatar }}
                    resizeMethod="resize"
                    resizeMode="cover"
                  />
                  <RatsText
                    text={formatName(guest.firstName, guest.lastName)}
                    style={{ fontSize: fontSize.extraLarge }}
                  />
                  <RatsText
                    text={guest.isAdmin ? 'Guest-Administrator' : 'Guest'}
                    style={{
                      fontSize: fontSize.medium,
                      alignSelf: 'center' as const,
                      color: color.dark_grey,
                    }}
                  />
                </View>
              </View>
              <View />
            </View>
            {renderSections(token)}
            <Can
              yes={() => (
                <View
                  style={[CARD_STYLE, { marginTop: 'auto', marginBottom: 0 }]}>
                  <RatsButton
                    title={
                      isSameUser(guest, user.id!)
                        ? 'Leave home'
                        : 'Remove from home'
                    }
                    onPress={removeGuest}
                    containerStyle={{
                      borderColor: color.red,
                      borderRadius: 1,
                      backgroundColor: color.red,
                    }}
                  />
                </View>
              )}
              role={token.role[house.id]}
              action="guest:delete"
              data={{
                guestUserId: guest ? guest.userId : null,
                userId: user.id,
              }}
            />
          </RatsScrollView>
        )}
      </AuthConsumer>
    </SafeAreaView>
  );
};

export default UserInfo;
