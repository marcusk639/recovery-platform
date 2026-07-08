import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Switch,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupMember} from '../../types';
import {GroupModel} from '../../models/GroupModel';
import auth from '@react-native-firebase/auth';

type GroupChatInfoScreenRouteProp = RouteProp<
  GroupStackParamList,
  'GroupChatInfo'
>;
type GroupChatInfoScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

const GroupChatInfoScreen: React.FC = () => {
  const route = useRoute<GroupChatInfoScreenRouteProp>();
  const navigation = useNavigation<GroupChatInfoScreenNavigationProp>();
  const {groupId, groupName} = route.params;

  // States
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Load group members and check if current user is admin
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const groupMembers = await GroupModel.getMembers(groupId);
        setMembers(groupMembers);

        // Check if current user is admin
        const currentUser = auth().currentUser;
        if (currentUser) {
          const isAdminUser = await GroupModel.isGroupAdmin(
            groupId,
            currentUser.uid,
          );
          setIsAdmin(isAdminUser);
        }
      } catch (error) {
        console.error('Error loading group members:', error);
        Alert.alert('Error', 'Failed to load group members. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [groupId]);

  // Handle navigation options
  useEffect(() => {
    navigation.setOptions({
      title: 'Chat Info',
    });
  }, [navigation]);

  // Toggle notifications
  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    // Here you would typically update the user's preferences in Firebase
    // For now, we'll just toggle the local state
  };

  // Navigate to member details
  const navigateToMemberDetails = (memberId: string) => {
    navigation.navigate('GroupMemberDetails', {
      groupId,
      memberId,
    });
  };

  // Render member item
  const renderMemberItem = ({item}: {item: GroupMember}) => {
    const isCurrentUser = item.id === auth().currentUser?.uid;

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => navigateToMemberDetails(item.id)}
        testID={`chat-info-member-${item.id}`}>
        <View style={styles.memberAvatarContainer}>
          {item.photoUrl ? (
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>
              {item.name} {isCurrentUser && '(You)'}
            </Text>
            {item.isAdmin && (
              <View style={styles.adminBadge}>
                <Icon name="crown" size={14} color="#FFA000" />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberPosition}>
            {item.position || 'Member'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Navigate to main group overview
  const navigateToGroupOverview = () => {
    navigation.navigate('GroupOverview', {
      groupId,
      groupName,
    });
  };

  // Main render
  return (
    <SafeAreaView
      style={styles.safeArea}
      testID={`group-chat-info-screen-${groupId}`}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />

      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loadingContainer} testID="chat-info-loader">
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Loading chat information...</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            renderItem={renderMemberItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            testID="chat-info-member-list"
            ListHeaderComponent={
              <>
                {/* Group info section */}
                <View style={styles.groupInfoSection}>
                  <Text style={styles.sectionTitle}>Group Information</Text>
                  <TouchableOpacity
                    style={styles.groupInfoButton}
                    onPress={navigateToGroupOverview}
                    testID="chat-info-view-group-button">
                    <Icon name="account-group" size={24} color="#2196F3" />
                    <Text style={styles.groupInfoText}>View Group Profile</Text>
                    <Icon name="chevron-right" size={24} color="#BDBDBD" />
                  </TouchableOpacity>
                </View>

                {/* Chat settings section */}
                <View
                  style={styles.settingsSection}
                  testID="chat-info-settings-section">
                  <Text style={styles.sectionTitle}>Chat Settings</Text>

                  <View style={styles.settingItem}>
                    <View style={styles.settingContent}>
                      <Icon name="bell" size={24} color="#212121" />
                      <Text style={styles.settingText}>Notifications</Text>
                    </View>
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={toggleNotifications}
                      testID="chat-info-notifications-switch"
                      trackColor={{false: '#BDBDBD', true: '#81D4FA'}}
                      thumbColor={notificationsEnabled ? '#2196F3' : '#F5F5F5'}
                      ios_backgroundColor="#BDBDBD"
                    />
                  </View>
                </View>

                {/* Members section */}
                <View style={styles.membersSection}>
                  <Text style={styles.sectionTitle}>
                    Members ({members.length})
                  </Text>
                </View>
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No members found</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
  },
  listContainer: {
    padding: 16,
  },
  groupInfoSection: {
    marginBottom: 24,
  },
  settingsSection: {
    marginBottom: 24,
  },
  membersSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  groupInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  groupInfoText: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  memberAvatarContainer: {
    marginRight: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  memberPosition: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FFA000',
  },
  adminBadgeText: {
    fontSize: 11,
    color: '#FF8F00',
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
    textAlign: 'center',
  },
});

export default GroupChatInfoScreen;
