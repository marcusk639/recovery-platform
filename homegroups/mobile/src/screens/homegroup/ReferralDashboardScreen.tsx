import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import Clipboard from '@react-native-community/clipboard';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchReferralStats,
  generateCode,
  selectReferralCode,
  selectReferralStats,
  selectReferralLoading,
  selectReferralError,
} from '../../store/slices/referralSlice';
import {selectGroupById} from '../../store/slices/groupsSlice';

type ReferralDashboardRouteProp = RouteProp<
  GroupStackParamList,
  'ReferralDashboard'
>;
type ReferralDashboardNavigationProp = StackNavigationProp<GroupStackParamList>;

const ReferralDashboardScreen: React.FC = () => {
  const route = useRoute<ReferralDashboardRouteProp>();
  const navigation = useNavigation<ReferralDashboardNavigationProp>();
  const {groupId, groupName} = route.params;

  const dispatch = useAppDispatch();
  const currentUser = auth().currentUser;

  const code = useAppSelector(selectReferralCode);
  const stats = useAppSelector(selectReferralStats);
  const loading = useAppSelector(selectReferralLoading);
  const error = useAppSelector(selectReferralError);
  const group = useAppSelector(state => selectGroupById(state, groupId));

  const [refreshing, setRefreshing] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Check admin status
  const isAdmin = currentUser && group?.admins?.includes(currentUser.uid);

  const loadStats = useCallback(async () => {
    try {
      await dispatch(fetchReferralStats()).unwrap();
    } catch (err: any) {
      // Error handled by selector
    }
  }, [dispatch]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const handleGenerateCode = async () => {
    if (!isAdmin) {
      Alert.alert(
        'Admin Required',
        'Only group admins can generate referral codes.',
      );
      return;
    }

    setGeneratingCode(true);
    try {
      await dispatch(generateCode({groupId})).unwrap();
      Alert.alert('Success', 'Your referral code has been generated!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate referral code.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (!code) return;
    Clipboard.setString(code);
    Alert.alert('Copied!', 'Referral code copied to clipboard.');
  };

  const handleShareCode = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on Homegroups! Use my referral code ${code} when creating your group to give us both a bonus. Download the app at https://recovery-connect-cad4b.web.app`,
        title: 'Join me on Homegroups',
      });
    } catch (err: any) {
      console.error('Share error:', err);
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Icon name="shield-off" size={48} color="#9E9E9E" />
        <Text style={styles.emptyText}>
          Only group admins can access the Referral Program.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }>
      {/* Header Section */}
      <View style={styles.headerSection}>
        <Icon name="share-variant" size={36} color="#2196F3" />
        <Text style={styles.headerTitle}>Referral Program</Text>
        <Text style={styles.headerSubtitle}>
          Refer other group admins and earn 1 free month for each conversion
        </Text>
      </View>

      {/* Referral Code Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Referral Code</Text>

        {loading && !code ? (
          <ActivityIndicator
            size="small"
            color="#2196F3"
            style={styles.loader}
          />
        ) : code ? (
          <>
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
            <View style={styles.codeActions}>
              <TouchableOpacity
                style={styles.codeActionButton}
                onPress={handleCopyCode}
                testID="copy-code-button">
                <Icon name="content-copy" size={18} color="#2196F3" />
                <Text style={styles.codeActionText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.codeActionButton, styles.shareButton]}
                onPress={handleShareCode}
                testID="share-code-button">
                <Icon name="share-variant" size={18} color="#FFFFFF" />
                <Text style={[styles.codeActionText, {color: '#FFFFFF'}]}>
                  Share
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.noCodeContainer}>
            <Text style={styles.noCodeText}>
              You don't have a referral code yet.
            </Text>
            <TouchableOpacity
              style={[
                styles.generateButton,
                generatingCode && styles.buttonDisabled,
              ]}
              onPress={handleGenerateCode}
              disabled={generatingCode}
              testID="generate-code-button">
              {generatingCode ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.generateButtonText}>
                  Generate Referral Code
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Stats Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Stats</Text>

        {loading && !stats ? (
          <ActivityIndicator
            size="small"
            color="#2196F3"
            style={styles.loader}
          />
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.totalReferrals ?? 0}</Text>
              <Text style={styles.statLabel}>Total Referrals</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.conversions ?? 0}</Text>
              <Text style={styles.statLabel}>Converted</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.rewardsEarned ?? 0}</Text>
              <Text style={styles.statLabel}>Months Earned</Text>
            </View>
          </View>
        )}
      </View>

      {/* How It Works Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How It Works</Text>
        <View style={styles.howItWorksStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.stepText}>
            Share your referral code with another group admin
          </Text>
        </View>
        <View style={styles.howItWorksStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.stepText}>
            They enter your code when setting up their group subscription
          </Text>
        </View>
        <View style={styles.howItWorksStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={styles.stepText}>
            When they subscribe, you get 1 free month added to your subscription
          </Text>
        </View>
      </View>

      {/* Error display */}
      {error && (
        <View style={styles.errorCard}>
          <Icon name="alert-circle" size={20} color="#F44336" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F5F5F5',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  headerSection: {
    backgroundColor: '#E3F2FD',
    padding: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1565C0',
    marginTop: 12,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#1976D2',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  loader: {
    marginVertical: 16,
  },
  codeContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1565C0',
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  codeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 6,
  },
  shareButton: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  codeActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  noCodeContainer: {
    alignItems: 'center',
  },
  noCodeText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
    textAlign: 'center',
  },
  generateButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1976D2',
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
    textAlign: 'center',
  },
  howItWorksStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    margin: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    flex: 1,
  },
});

export default ReferralDashboardScreen;
