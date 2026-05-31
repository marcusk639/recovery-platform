import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {IntergroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadIntergroup,
  loadAffiliatedGroups,
  selectIntergroup,
  selectAffiliatedGroups,
  selectIntergroupGroupCount,
  selectIsAtGroupLimit,
} from '../../store/slices/intergroupSlice';

type Route = RouteProp<IntergroupStackParamList, 'IntergroupDashboard'>;
type Nav = StackNavigationProp<IntergroupStackParamList, 'IntergroupDashboard'>;

const IntergroupDashboardScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const {intergroupId} = route.params;

  const intergroup = useAppSelector(selectIntergroup);
  const affiliatedGroups = useAppSelector(selectAffiliatedGroups);
  const groupCount = useAppSelector(selectIntergroupGroupCount);
  const isAtLimit = useAppSelector(selectIsAtGroupLimit);
  const [loading, setLoading] = useState(true);

  const handleUpgrade = async () => {
    try {
      const callable = functions().httpsCallable('upgradeIntergroupTier');
      const result = await callable({intergroupId});
      const {checkoutUrl} = result.data as {checkoutUrl?: string};
      if (!checkoutUrl) throw new Error('No checkout URL returned from server');
      await Linking.openURL(checkoutUrl);
    } catch (err: any) {
      Alert.alert(
        'Upgrade Failed',
        err?.message ?? 'Could not start the upgrade. Please try again.',
      );
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await dispatch(loadIntergroup(intergroupId)).unwrap();
        await dispatch(loadAffiliatedGroups(intergroupId)).unwrap();
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to load intergroup');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [dispatch, intergroupId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!intergroup) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Intergroup not found</Text>
      </View>
    );
  }

  const tierLabel =
    intergroup.tier === 'tier_a'
      ? `Intergroup Tier A — ${groupCount}/${intergroup.maxGroups} groups`
      : `Intergroup Unlimited — ${groupCount} groups`;

  const totalMembers = affiliatedGroups.reduce(
    (sum, g) => sum + (g.memberCount || 0),
    0,
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{intergroup.name}</Text>
        <TouchableOpacity
          onPress={() =>
            Alert.alert(
              'Coming Soon',
              'Intergroup settings are not yet available.',
            )
          }>
          <Text style={styles.settingsIcon}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Tier Badge */}
      <View style={styles.tierBadge}>
        <Text style={styles.tierText}>{tierLabel}</Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.cardRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.cardNumber}>{totalMembers}</Text>
          <Text style={styles.cardLabel}>Total Members</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.cardNumber}>{groupCount}</Text>
          <Text style={styles.cardLabel}>Active Groups</Text>
        </View>
      </View>

      {/* Affiliated Groups */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Affiliated Groups</Text>
        {affiliatedGroups.map(group => (
          <TouchableOpacity
            key={group.id}
            style={styles.groupCard}
            onPress={() =>
              navigation.navigate('IntergroupGroupDetail', {
                intergroupId,
                groupId: group.id!,
              })
            }>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupMeta}>
              Members: {group.memberCount || 0}
            </Text>
          </TouchableOpacity>
        ))}
        {!isAtLimit && (
          <TouchableOpacity
            style={styles.affiliateButton}
            onPress={() =>
              navigation.navigate('IntergroupGroups', {intergroupId})
            }>
            <Text style={styles.affiliateButtonText}>
              + Affiliate Another Group
            </Text>
          </TouchableOpacity>
        )}
        {isAtLimit && intergroup.tier === 'tier_a' && (
          <Text style={styles.upgradePrompt}>
            Group limit reached — upgrade below to add more groups.
          </Text>
        )}
      </View>

      {/* Announcements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            navigation.navigate('IntergroupAnnouncement', {intergroupId})
          }>
          <Text style={styles.primaryButtonText}>Broadcast Announcement</Text>
        </TouchableOpacity>
      </View>

      {/* Treatment Center / Facility */}
      {intergroup.type === 'treatment_center' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facility Dashboard</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              navigation.navigate('FacilityDashboard', {intergroupId})
            }>
            <Text style={styles.primaryButtonText}>View Facility Stats</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SSO Settings */}
      {intergroup.tier === 'tier_b' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SSO / Auto-Join</Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              navigation.navigate('IntergroupSSO', {intergroupId})
            }>
            <Text style={styles.secondaryButtonText}>Configure SSO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Subscription Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <Text style={styles.subText}>
          Status: {intergroup.subscriptionStatus}
        </Text>
        {intergroup.tier === 'tier_a' && (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>Upgrade to Unlimited</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  errorText: {color: '#f44336', fontSize: 16},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {fontSize: 20, fontWeight: '700', color: '#1a1a1a'},
  settingsIcon: {fontSize: 14, color: '#2196F3'},
  tierBadge: {
    margin: 16,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  tierText: {fontSize: 14, fontWeight: '600', color: '#1565C0'},
  cardRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardNumber: {fontSize: 28, fontWeight: '700', color: '#2196F3'},
  cardLabel: {fontSize: 12, color: '#666', marginTop: 4},
  section: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  groupName: {fontSize: 15, fontWeight: '600', color: '#1a1a1a'},
  groupMeta: {fontSize: 12, color: '#666', marginTop: 2},
  affiliateButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  affiliateButtonText: {color: '#2196F3', fontWeight: '600'},
  upgradeButton: {
    padding: 12,
    backgroundColor: '#FF9800',
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  upgradeButtonText: {color: '#fff', fontWeight: '600'},
  upgradePrompt: {
    fontSize: 13,
    color: '#E65100',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  primaryButton: {
    padding: 14,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  secondaryButton: {
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  secondaryButtonText: {color: '#2196F3', fontWeight: '700', fontSize: 15},
  subText: {fontSize: 14, color: '#555', marginBottom: 8},
});

export default IntergroupDashboardScreen;
