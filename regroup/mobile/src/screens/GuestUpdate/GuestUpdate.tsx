/**
 * GuestUpdate - Migrated to React Query + Redux Toolkit
 *
 * Changes from original:
 * - Class component → Functional component with hooks
 * - Redux connect → React Query mutations + RTK slices
 * - Manual loading/error states → Handled by React Query + UI slice
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

// Hooks
import { useGuests, useUpdateGuest } from '../../state/queries';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';

// Components
import GuestUpdateForm from './GuestUpdateForm';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import RatsLoadingModal from '../../components/rats-loading-modal';

// Utils
import { color } from '../../styles/theme';

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.white,
  },
});

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * GuestUpdate Screen - Container for updating guest information
 *
 * Uses React Query mutations for:
 * - Optimistic updates
 * - Automatic error handling
 * - Loading states
 */
const GuestUpdateScreen: React.FC<Props> = ({ navigation }) => {
  // Get selected house from Redux
  const { house } = useSelectedHouse();

  // Fetch guests using React Query
  const { data: guests, isLoading: requestingGuests } = useGuests(
    house?.id || '',
    !!house?.id,
  );

  // Get mutation hook for updating guests
  const updateGuestMutation = useUpdateGuest();

  // Loading state from React Query
  if (requestingGuests) {
    return <RatsLoadingIndicator />;
  }

  return (
    <View style={styles.container}>
      {/* Loading modal for update operations */}
      <RatsLoadingModal
        isVisible={updateGuestMutation.isPending}
        loading={updateGuestMutation.isPending}
        loadingMessage="Updating Guest"
        error={updateGuestMutation.error?.message ?? ''}
        success={false}
      />

      {/* Guest update form - passes navigation to child */}
      <GuestUpdateForm navigation={navigation} />
    </View>
  );
};

export default GuestUpdateScreen;
