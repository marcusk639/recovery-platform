// mobile/src/screens/homegroup/GroupResourceLibraryScreen.tsx
import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadGroupResources,
  deleteGroupResource,
  selectGroupResources,
  selectGroupResourcesStatus,
} from '../../store/slices/groupResourcesSlice';
import {selectUserData} from '../../store/slices/authSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {GroupResourceDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/Ionicons';

type GroupResourceLibraryRouteProp = RouteProp<
  GroupStackParamList,
  'GroupResourceLibrary'
>;
type GroupResourceNavProp = StackNavigationProp<GroupStackParamList>;

const typeIconMap: Record<string, string> = {
  pdf: 'document-text-outline',
  document: 'document-outline',
  image: 'image-outline',
  link: 'link-outline',
  other: 'attach-outline',
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const GroupResourceLibraryScreen: React.FC = () => {
  const route = useRoute<GroupResourceLibraryRouteProp>();
  const navigation = useNavigation<GroupResourceNavProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName} = route.params;

  const resources = useAppSelector(state => selectGroupResources(state, groupId));
  const status = useAppSelector(selectGroupResourcesStatus);
  const userData = useAppSelector(selectUserData);
  const members = useAppSelector(state => selectMembersByGroupId(state, groupId));
  const currentMember = members?.find(m => m.userId === userData?.uid);
  const isAdmin =
    currentMember?.isAdmin ||
    currentMember?.roles?.includes('admin');

  useEffect(() => {
    dispatch(loadGroupResources(groupId));
  }, [dispatch, groupId]);

  const handleOpen = (resource: GroupResourceDocument) => {
    const url = resource.source === 'upload' ? resource.downloadUrl : resource.externalUrl;
    if (!url) {
      Alert.alert('Error', 'No URL available for this resource.');
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open this resource.');
    });
  };

  const handleDelete = (resource: GroupResourceDocument) => {
    Alert.alert(
      'Delete Resource',
      `Are you sure you want to remove "${resource.title}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(
                deleteGroupResource({groupId, resourceId: resource.id}),
              ).unwrap();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete resource.');
            }
          },
        },
      ],
    );
  };

  const renderItem = ({item}: {item: GroupResourceDocument}) => {
    const iconName = typeIconMap[item.type] || 'attach-outline';

    return (
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Icon name={iconName} size={24} color="#7B1FA2" />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          {item.description && (
            <Text style={styles.rowDesc} numberOfLines={1}>
              {item.description}
            </Text>
          )}
          <View style={styles.rowMeta}>
            <Text style={styles.rowMetaText}>By {item.uploaderName}</Text>
            {item.fileSize ? (
              <Text style={styles.rowMetaText}> · {formatFileSize(item.fileSize)}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity
            style={styles.openButton}
            onPress={() => handleOpen(item)}>
            <Text style={styles.openButtonText}>Open</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}>
              <Icon name="trash-outline" size={18} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{groupName}</Text>
          <Text style={styles.headerSubtitle}>Group Resources</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() =>
              navigation.navigate('AddGroupResource', {groupId, groupName})
            }>
            <Icon name="add" size={22} color="#7B1FA2" />
          </TouchableOpacity>
        )}
      </View>

      {status === 'loading' ? (
        <ActivityIndicator size="large" color="#7B1FA2" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={resources}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="folder-open-outline" size={56} color="#CE93D8" />
              <Text style={styles.emptyTitle}>No Resources Yet</Text>
              <Text style={styles.emptyBody}>
                {isAdmin
                  ? 'Add PDFs, documents, or links to share with your group members.'
                  : 'Admins can upload PDFs, link documents, or add local intergroup contacts.'}
              </Text>
              {isAdmin && (
                <TouchableOpacity
                  style={styles.addFirstButton}
                  onPress={() =>
                    navigation.navigate('AddGroupResource', {groupId, groupName})
                  }>
                  <Text style={styles.addFirstButtonText}>Add First Resource</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerLeft: {flex: 1},
  headerTitle: {fontSize: 16, fontWeight: '700', color: '#212121'},
  headerSubtitle: {fontSize: 13, color: '#9E9E9E', marginTop: 2},
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {padding: 12, paddingBottom: 32},
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: {flex: 1},
  rowTitle: {fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 2},
  rowDesc: {fontSize: 13, color: '#616161', marginBottom: 4},
  rowMeta: {flexDirection: 'row'},
  rowMetaText: {fontSize: 12, color: '#9E9E9E'},
  rowActions: {flexDirection: 'column', alignItems: 'flex-end', gap: 6},
  openButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openButtonText: {fontSize: 12, color: '#fff', fontWeight: '600'},
  deleteButton: {padding: 4},
  emptyState: {alignItems: 'center', padding: 40},
  emptyTitle: {fontSize: 20, fontWeight: '700', color: '#4A148C', marginTop: 16, marginBottom: 8},
  emptyBody: {fontSize: 14, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 20},
  addFirstButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  addFirstButtonText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});

export default GroupResourceLibraryScreen;
