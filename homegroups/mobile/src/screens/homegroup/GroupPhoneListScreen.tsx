import React, {useState, useEffect, useCallback, useLayoutEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';

type GroupPhoneListRouteProp = RouteProp<GroupStackParamList, 'GroupPhoneList'>;
type GroupPhoneListNavigationProp = StackNavigationProp<GroupStackParamList>;

interface PhoneMember {
  id: string;
  displayName: string;
  phoneNumber: string;
  position?: string;
  roles?: string[];
}

const GroupPhoneListScreen: React.FC = () => {
  const route = useRoute<GroupPhoneListRouteProp>();
  const navigation = useNavigation<GroupPhoneListNavigationProp>();
  const {groupId, groupName} = route.params;

  const [members, setMembers] = useState<PhoneMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<PhoneMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await firestore()
        .collection('group_members')
        .where('groupId', '==', groupId)
        .where('showPhoneNumber', '==', true)
        .get();

      const loaded: PhoneMember[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            displayName: data.displayName || 'Unknown',
            phoneNumber: data.phoneNumber || '',
            position: data.position,
            roles: data.roles || [],
          };
        })
        .filter(m => m.phoneNumber.length > 0)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      setMembers(loaded);
      setFilteredMembers(loaded);
    } catch (error: any) {
      console.error('Error loading phone list:', error);
      Alert.alert('Error', 'Failed to load phone list. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      setFilteredMembers(members);
    } else {
      setFilteredMembers(
        members.filter(m => m.displayName.toLowerCase().includes(query)),
      );
    }
  }, [searchQuery, members]);

  const handleCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() =>
      Alert.alert('Error', 'Unable to open phone dialer.'),
    );
  };

  const handleText = (phoneNumber: string) => {
    Linking.openURL(`sms:${phoneNumber}`).catch(() =>
      Alert.alert('Error', 'Unable to open messaging app.'),
    );
  };

  const generatePhoneListHTML = (): string => {
    const rows = members
      .map(
        m => `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #eee;">
          <strong>${m.displayName}</strong>
          ${m.position ? `<br/><span style="font-size:12px;color:#757575;">${m.position}</span>` : ''}
        </td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #eee; color: #2196F3;">
          ${m.phoneNumber}
        </td>
      </tr>`,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8"/>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #212121; }
          h1 { font-size: 22px; color: #212121; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #757575; font-weight: normal; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #2196F3; color: white; padding: 10px 14px; text-align: left; font-size: 14px; }
          tr:nth-child(even) { background: #F5F5F5; }
          .footer { margin-top: 24px; font-size: 11px; color: #9E9E9E; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${groupName} — Phone List</h1>
        <h2>${members.length} member${members.length !== 1 ? 's' : ''} sharing phone number &bull; Generated ${new Date().toLocaleDateString()}</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone Number</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">This list is for group members only. Please respect everyone's privacy.</div>
      </body>
      </html>`;
  };

  const handleShareAsPDF = async () => {
    setSharing(true);
    try {
      const html = generatePhoneListHTML();
      const options = {
        html,
        fileName: `${groupName.replace(/[^a-z0-9]/gi, '_')}_phone_list`,
        directory: Platform.OS === 'ios' ? 'Documents' : 'Downloads',
      };
      const pdf = await RNHTMLtoPDF.convert(options);
      if (pdf?.filePath) {
        await Share.share({
          title: `${groupName} Phone List`,
          url: Platform.OS === 'ios' ? `file://${pdf.filePath}` : pdf.filePath,
          message:
            Platform.OS === 'android' ? `${groupName} Phone List` : undefined,
        });
      }
    } catch (error: any) {
      console.error('Error sharing phone list:', error);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleShareAsPDF}
          disabled={sharing || members.length === 0}
          style={{marginRight: 12, padding: 4}}
          testID="phone-list-share-button">
          {sharing ? (
            <ActivityIndicator size="small" color="#2196F3" />
          ) : (
            <Icon name="file-pdf-box" size={24} color="#2196F3" />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, sharing, members]);

  const getPositionBadge = (member: PhoneMember): string | null => {
    if (member.position) return member.position;
    if (member.roles?.includes('admin')) return 'Admin';
    if (member.roles?.includes('treasurer')) return 'Treasurer';
    if (member.roles?.includes('secretary')) return 'Secretary';
    return null;
  };

  const renderItem = ({item}: {item: PhoneMember}) => {
    const badge = getPositionBadge(item);
    return (
      <View style={styles.memberRow} testID={`phone-list-member-${item.id}`}>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName}</Text>
          {badge && (
            <View style={styles.positionBadge}>
              <Text style={styles.positionBadgeText}>{badge}</Text>
            </View>
          )}
          <Text style={styles.phoneNumber}>{item.phoneNumber}</Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton]}
            onPress={() => handleCall(item.phoneNumber)}
            testID={`phone-list-call-${item.id}`}>
            <Icon name="phone" size={20} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.textButton]}
            onPress={() => handleText(item.phoneNumber)}
            testID={`phone-list-text-${item.id}`}>
            <Icon name="message-text" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="phone-list-screen">
      {/* Summary header */}
      <View style={styles.summaryHeader}>
        <Icon name="phone-multiple" size={20} color="#2196F3" />
        <Text style={styles.summaryText}>
          {members.length} member{members.length !== 1 ? 's' : ''} sharing phone
          number
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Icon
          name="magnify"
          size={20}
          color="#9E9E9E"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor="#9E9E9E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="phone-list-search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Phone list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="phone-off" size={48} color="#BDBDBD" />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No members found' : 'No phone numbers shared yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Try a different search term'
                : 'Members can share their phone number in their profile settings'}
            </Text>
          </View>
        }
        testID="phone-list-flatlist"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#212121',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 2,
  },
  positionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  positionBadgeText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '600',
  },
  phoneNumber: {
    fontSize: 14,
    color: '#2196F3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButton: {
    backgroundColor: '#E8F5E9',
  },
  textButton: {
    backgroundColor: '#E3F2FD',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#616161',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default GroupPhoneListScreen;
