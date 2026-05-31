import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format, formatDistanceToNow, isAfter} from 'date-fns';
import {showMessage} from 'react-native-flash-message';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGroupBans,
  revokeBan,
  selectBansByGroup,
  selectReportsStatus,
  selectReportsError,
} from '../../store/slices/reportsSlice';
import {UserBan} from '../../models/ReportModel';

type UserBansScreenRouteProp = RouteProp<GroupStackParamList, 'UserBans'>;
type UserBansScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'UserBans'
>;

type FilterType = 'all' | 'active' | 'expired' | 'revoked';

const FILTER_OPTIONS: {label: string; value: FilterType}[] = [
  {label: 'All', value: 'all'},
  {label: 'Active', value: 'active'},
  {label: 'Expired', value: 'expired'},
  {label: 'Revoked', value: 'revoked'},
];

const UserBansScreen: React.FC = () => {
  const route = useRoute<UserBansScreenRouteProp>();
  const navigation = useNavigation<UserBansScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  const bans = useAppSelector(state => selectBansByGroup(state, groupId));
  const status = useAppSelector(selectReportsStatus);
  const error = useAppSelector(selectReportsError);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('active');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchGroupBans(groupId));
  }, [dispatch, groupId]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Banned Users',
    });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchGroupBans(groupId)).unwrap();
    } catch (err) {
      console.error('Error refreshing bans:', err);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, groupId]);

  const getBanStatus = (ban: UserBan): 'active' | 'expired' | 'revoked' => {
    if (!ban.isActive) return 'revoked';
    if (ban.expiresAt && isAfter(new Date(), ban.expiresAt)) return 'expired';
    return 'active';
  };

  const filteredBans = bans.filter(ban => {
    if (selectedFilter === 'all') return true;
    return getBanStatus(ban) === selectedFilter;
  });

  const getActiveCount = () =>
    bans.filter(b => getBanStatus(b) === 'active').length;

  const handleRevokeBan = (ban: UserBan) => {
    Alert.alert(
      'Revoke Ban',
      `Are you sure you want to revoke the ban on ${ban.userName}? They will be able to participate in the group again.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Revoke Ban',
          onPress: async () => {
            setRevokingId(ban.id);
            try {
              await dispatch(revokeBan(ban.id)).unwrap();
              showMessage({
                message: 'Ban revoked',
                description: `${ban.userName} can now participate in the group`,
                type: 'success',
              });
            } catch (err: any) {
              showMessage({
                message: 'Failed to revoke ban',
                description: err || 'Please try again',
                type: 'danger',
              });
            } finally {
              setRevokingId(null);
            }
          },
        },
      ],
    );
  };

  const renderFilterChip = ({
    label,
    value,
  }: {
    label: string;
    value: FilterType;
  }) => {
    const isSelected = selectedFilter === value;
    const count =
      value === 'all'
        ? bans.length
        : bans.filter(b => getBanStatus(b) === value).length;

    return (
      <TouchableOpacity
        key={value}
        style={[styles.filterChip, isSelected && styles.filterChipSelected]}
        onPress={() => setSelectedFilter(value)}>
        <Text
          style={[
            styles.filterChipText,
            isSelected && styles.filterChipTextSelected,
          ]}>
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  };

  const renderBanItem = ({item}: {item: UserBan}) => {
    const banStatus = getBanStatus(item);
    const isRevoking = revokingId === item.id;

    const getStatusColor = () => {
      switch (banStatus) {
        case 'active':
          return '#F44336';
        case 'expired':
          return '#9E9E9E';
        case 'revoked':
          return '#4CAF50';
        default:
          return '#757575';
      }
    };

    const getStatusLabel = () => {
      switch (banStatus) {
        case 'active':
          return item.expiresAt
            ? `Expires ${formatDistanceToNow(item.expiresAt, {
                addSuffix: true,
              })}`
            : 'Permanent';
        case 'expired':
          return 'Expired';
        case 'revoked':
          return `Revoked ${
            item.revokedAt
              ? formatDistanceToNow(item.revokedAt, {addSuffix: true})
              : ''
          }`;
        default:
          return '';
      }
    };

    return (
      <View style={styles.banCard}>
        <View style={styles.banHeader}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {item.userName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.userName}</Text>
            <Text style={styles.bannedByText}>
              Banned by {item.bannedByName}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {backgroundColor: getStatusColor() + '15'},
            ]}>
            <Text style={[styles.statusBadgeText, {color: getStatusColor()}]}>
              {banStatus.charAt(0).toUpperCase() + banStatus.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.banDetails}>
          <View style={styles.detailRow}>
            <Icon name="calendar" size={16} color="#757575" />
            <Text style={styles.detailText}>
              Banned {format(item.bannedAt, 'MMM d, yyyy h:mm a')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Icon name="clock-outline" size={16} color="#757575" />
            <Text style={styles.detailText}>{getStatusLabel()}</Text>
          </View>

          <View style={styles.reasonContainer}>
            <Icon name="alert-circle-outline" size={16} color="#FF9800" />
            <Text style={styles.reasonText}>{item.reason}</Text>
          </View>
        </View>

        {banStatus === 'active' && (
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={() => handleRevokeBan(item)}
            disabled={isRevoking}>
            {isRevoking ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <>
                <Icon name="account-check" size={18} color="#4CAF50" />
                <Text style={styles.revokeButtonText}>Revoke Ban</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {banStatus === 'revoked' && item.revokedByName && (
          <View style={styles.revokedInfo}>
            <Icon name="check-circle" size={16} color="#4CAF50" />
            <Text style={styles.revokedInfoText}>
              Revoked by {item.revokedByName}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (status === 'loading' && bans.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading bans...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Summary Header */}
      <View style={styles.summaryContainer}>
        <Icon
          name="account-cancel"
          size={32}
          color={getActiveCount() > 0 ? '#F44336' : '#4CAF50'}
        />
        <View style={styles.summaryText}>
          <Text style={styles.summaryCount}>{getActiveCount()}</Text>
          <Text style={styles.summaryLabel}>
            Active {getActiveCount() === 1 ? 'Ban' : 'Bans'}
          </Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        {FILTER_OPTIONS.map(filter => renderFilterChip(filter))}
      </View>

      {/* Bans List */}
      <FlatList
        data={filteredBans}
        renderItem={renderBanItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon
              name={
                selectedFilter === 'active' ? 'check-circle' : 'account-search'
              }
              size={64}
              color={selectedFilter === 'active' ? '#4CAF50' : '#9E9E9E'}
            />
            <Text style={styles.emptyTitle}>
              {selectedFilter === 'active' ? 'No active bans' : 'No bans found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {selectedFilter === 'active'
                ? 'All members are in good standing'
                : 'No bans match this filter'}
            </Text>
          </View>
        }
      />

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  summaryText: {
    marginLeft: 16,
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#212121',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  filterChipSelected: {
    backgroundColor: '#FFEBEE',
  },
  filterChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#F44336',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  banCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  banHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  bannedByText: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  banDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 8,
  },
  reasonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    color: '#F57C00',
    marginLeft: 8,
    lineHeight: 18,
  },
  revokeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
    minHeight: 44,
    marginTop: 4,
    gap: 6,
  },
  revokeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  revokedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  revokedInfoText: {
    fontSize: 13,
    color: '#4CAF50',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default UserBansScreen;
