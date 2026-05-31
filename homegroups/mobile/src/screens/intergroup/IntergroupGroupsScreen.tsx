import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import {IntergroupStackParamList} from '../../types/navigation';
import {useAppDispatch} from '../../store';
import {
  affiliateGroup,
  loadIntergroup,
  loadAffiliatedGroups,
} from '../../store/slices/intergroupSlice';

type Route = RouteProp<IntergroupStackParamList, 'IntergroupGroups'>;
type Nav = StackNavigationProp<IntergroupStackParamList, 'IntergroupGroups'>;

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
  orgId?: string;
}

const IntergroupGroupsScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const {intergroupId} = route.params;

  const PAGE_SIZE = 100;

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [affiliating, setAffiliating] = useState<string | null>(null);
  const cursorRef = useRef<any>(null);

  const fetchPage = useCallback(async (isFirst: boolean) => {
    try {
      let query = firestore()
        .collection('groups')
        .orderBy('name')
        .limit(PAGE_SIZE);
      if (!isFirst && cursorRef.current) {
        query = query.startAfter(cursorRef.current);
      }
      const snap = await query.get();
      const items: GroupItem[] = snap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        memberCount: doc.data().memberCount || 0,
        orgId: doc.data().orgId,
      }));
      const unaffiliated = items.filter(g => !g.orgId);
      cursorRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setGroups(prev => (isFirst ? unaffiliated : [...prev, ...unaffiliated]));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load groups');
    }
  }, []);

  useEffect(() => {
    fetchPage(true).finally(() => setLoading(false));
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(false);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchPage]);

  const handleAffiliate = async (groupId: string) => {
    Alert.alert('Affiliate Group', 'Add this group to your intergroup?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Affiliate',
        onPress: async () => {
          setAffiliating(groupId);
          try {
            await dispatch(affiliateGroup({intergroupId, groupId})).unwrap();
            await dispatch(loadIntergroup(intergroupId)).unwrap();
            await dispatch(loadAffiliatedGroups(intergroupId)).unwrap();
            Alert.alert('Success', 'Group affiliated successfully');
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to affiliate group');
          } finally {
            setAffiliating(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={groups}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.content}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No available groups found</Text>
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator
            size="small"
            color="#2196F3"
            style={{marginVertical: 16}}
          />
        ) : null
      }
      renderItem={({item}) => (
        <View style={styles.groupCard}>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName}>{item.name}</Text>
            <Text style={styles.groupMeta}>{item.memberCount} members</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.affiliateButton,
              affiliating === item.id && styles.affiliateButtonDisabled,
            ]}
            onPress={() => handleAffiliate(item.id)}
            disabled={affiliating === item.id}>
            {affiliating === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.affiliateButtonText}>Affiliate</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  content: {padding: 16},
  emptyText: {textAlign: 'center', color: '#999', marginTop: 40},
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  groupInfo: {flex: 1},
  groupName: {fontSize: 15, fontWeight: '600', color: '#1a1a1a'},
  groupMeta: {fontSize: 12, color: '#666', marginTop: 2},
  affiliateButton: {
    backgroundColor: '#2196F3',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  affiliateButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  affiliateButtonText: {color: '#fff', fontWeight: '600'},
});

export default IntergroupGroupsScreen;
