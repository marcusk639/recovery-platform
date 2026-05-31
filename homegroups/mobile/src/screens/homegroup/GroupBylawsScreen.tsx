import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {BylawDocument, BylawVersion} from '../../types/schema';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';
import {BylawsReportService} from '../../services/reports/BylawsReportService';

type GroupBylawsRouteProp = RouteProp<GroupStackParamList, 'GroupBylaws'>;
type GroupBylawsNavigationProp = StackNavigationProp<GroupStackParamList>;

const GroupBylawsScreen: React.FC = () => {
  const route = useRoute<GroupBylawsRouteProp>();
  const navigation = useNavigation<GroupBylawsNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isAdmin = group?.admins?.includes(currentUser?.uid || '') ?? false;

  const [bylaw, setBylaw] = useState<BylawDocument | null>(null);
  const [versions, setVersions] = useState<BylawVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [versionsExpanded, setVersionsExpanded] = useState(false);
  const [sharingPDF, setSharingPDF] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const bylawDoc = await firestore()
        .collection('group_bylaws')
        .doc(groupId)
        .get();

      if (bylawDoc.exists) {
        setBylaw({...bylawDoc.data()} as BylawDocument);

        // Load version history
        const versionsSnapshot = await firestore()
          .collection('group_bylaws')
          .doc(groupId)
          .collection('versions')
          .orderBy(firestore.FieldPath.documentId(), 'desc')
          .get();

        const loadedVersions: BylawVersion[] = versionsSnapshot.docs.map(
          doc => doc.data() as BylawVersion,
        );
        setVersions(loadedVersions);
      } else {
        setBylaw(null);
        setVersions([]);
      }
    } catch (error) {
      console.error('Error loading bylaws:', error);
      Alert.alert('Error', 'Failed to load guidelines.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isAdmin && bylaw) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              navigation.navigate('EditBylaws', {groupId, groupName})
            }
            testID="edit-bylaws-header-button">
            <Icon name="pencil" size={22} color="#2196F3" />
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, isAdmin, bylaw, groupId, groupName]);

  const formatTimestamp = (ts: any): string => {
    try {
      const date =
        typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
      return format(date, 'MMM d, yyyy');
    } catch {
      return 'Unknown date';
    }
  };

  const handleSharePDF = async () => {
    if (!bylaw) return;
    setSharingPDF(true);
    try {
      await BylawsReportService.generateAndShare(bylaw, groupName);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate PDF.');
    } finally {
      setSharingPDF(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ratified':
        return '#4CAF50';
      case 'draft':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ratified':
        return 'RATIFIED';
      case 'draft':
        return 'DRAFT';
      default:
        return status.toUpperCase();
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#388E3C" />
      </View>
    );
  }

  if (!bylaw) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="clipboard-text-outline" size={56} color="#BDBDBD" />
        <Text style={styles.emptyTitle}>No Guidelines Yet</Text>
        <Text style={styles.emptySubtitle}>
          Your group hasn't added guidelines yet.
        </Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() =>
              navigation.navigate('EditBylaws', {groupId, groupName})
            }
            testID="create-bylaws-button">
            <Icon
              name="plus"
              size={18}
              color="#FFFFFF"
              style={{marginRight: 8}}
            />
            <Text style={styles.createButtonText}>Create Guidelines</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadData} />
      }
      testID="group-bylaws-screen">
      {/* Version & Status badges */}
      <View style={styles.headerSection}>
        <Text style={styles.bylawTitle}>{bylaw.title}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>
              v{bylaw.version}
              {bylaw.status === 'ratified' && bylaw.ratifiedAt
                ? ` — Ratified ${formatTimestamp(bylaw.ratifiedAt)}`
                : ''}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {backgroundColor: getStatusColor(bylaw.status)},
            ]}>
            <Text style={styles.statusBadgeText}>
              {getStatusLabel(bylaw.status)}
            </Text>
          </View>
        </View>
      </View>

      {/* Full guidelines text */}
      <View style={styles.contentSection}>
        <Text style={styles.bylawContent}>{bylaw.content}</Text>
      </View>

      {/* Version History */}
      {versions.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setVersionsExpanded(!versionsExpanded)}>
            <Text style={styles.sectionTitle}>Version History</Text>
            <Icon
              name={versionsExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#757575"
            />
          </TouchableOpacity>
          {versionsExpanded &&
            versions.map(v => (
              <View key={v.version} style={styles.versionRow}>
                <Text style={styles.versionRowText}>
                  v{v.version} — Ratified{' '}
                  {v.ratifiedAt ? formatTimestamp(v.ratifiedAt) : 'Unknown'}
                </Text>
                <Icon name="chevron-right" size={16} color="#9E9E9E" />
              </View>
            ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={[styles.actionButton, styles.pdfButton]}
          onPress={handleSharePDF}
          disabled={sharingPDF}
          testID="share-pdf-button">
          {sharingPDF ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon
                name="file-pdf-box"
                size={18}
                color="#FFFFFF"
                style={{marginRight: 8}}
              />
              <Text style={styles.actionButtonText}>Share PDF</Text>
            </>
          )}
        </TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() =>
              navigation.navigate('EditBylaws', {groupId, groupName})
            }
            testID="edit-bylaws-button">
            <Icon
              name="pencil"
              size={18}
              color="#388E3C"
              style={{marginRight: 8}}
            />
            <Text style={[styles.actionButtonText, {color: '#388E3C'}]}>
              Edit Guidelines
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{height: 32}} />
    </ScrollView>
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#388E3C',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  headerButton: {
    marginRight: 12,
    padding: 4,
  },
  headerSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  bylawTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionBadge: {
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  versionBadgeText: {
    fontSize: 12,
    color: '#616161',
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  contentSection: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bylawContent: {
    fontSize: 15,
    color: '#212121',
    lineHeight: 24,
    fontFamily: 'System',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 8,
  },
  versionRowText: {
    fontSize: 14,
    color: '#424242',
  },
  actionsSection: {
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pdfButton: {
    backgroundColor: '#388E3C',
  },
  editButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#388E3C',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default GroupBylawsScreen;
