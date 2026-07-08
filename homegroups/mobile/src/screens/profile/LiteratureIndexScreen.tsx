// mobile/src/screens/profile/LiteratureIndexScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {ProfileStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadLiteratureIndex,
  loadSavedLiterature,
  setSearchQuery,
  selectAllLiterature,
  selectLiteratureStatus,
  selectLiteratureSearchQuery,
  selectIsLiteratureSaved,
} from '../../store/slices/literatureSlice';
import {LiteratureIndexDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/Ionicons';
import {RootState} from '../../store/types';
import {useAppSelector as useSelector} from '../../store';

type LiteratureNavProp = StackNavigationProp<ProfileStackParamList>;

const FILTER_CHIPS = [
  {label: 'All', value: undefined},
  {label: 'Step Work', value: 'step-work'},
  {label: 'Gratitude', value: 'gratitude'},
  {label: 'Service', value: 'service'},
  {label: 'Prayers', value: 'prayer'},
];

const TypeBadge: React.FC<{type: string}> = ({type}) => {
  const colorMap: Record<string, string> = {
    guide: '#1565C0',
    meditation: '#6A1B9A',
    prayer: '#2E7D32',
    article: '#E65100',
    pamphlet: '#37474F',
    external_link: '#0277BD',
  };
  return (
    <View
      style={[
        styles.typeBadge,
        {backgroundColor: colorMap[type] || '#616161'},
      ]}>
      <Text style={styles.typeBadgeText}>
        {type === 'external_link' ? 'External Link' : type.charAt(0).toUpperCase() + type.slice(1)}
      </Text>
    </View>
  );
};

const LiteratureRow: React.FC<{
  item: LiteratureIndexDocument;
  onPress: () => void;
}> = ({item, onPress}) => {
  const isSaved = useSelector((state: RootState) =>
    selectIsLiteratureSaved(state, item.id),
  );

  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowHeader}>
        <TypeBadge type={item.type} />
        {item.program && (
          <View style={styles.programBadge}>
            <Text style={styles.programBadgeText}>{item.program}</Text>
          </View>
        )}
        {isSaved && (
          <Icon name="bookmark" size={16} color="#F9A825" style={{marginLeft: 4}} />
        )}
      </View>
      <Text style={styles.rowTitle}>{item.title}</Text>
      {item.author && <Text style={styles.rowAuthor}>by {item.author}</Text>}
      <Text style={styles.rowSummary} numberOfLines={2}>
        {item.summary}
      </Text>
      <View style={styles.rowFooter}>
        {item.tags.slice(0, 3).map(tag => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
};

const LiteratureIndexScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<LiteratureNavProp>();
  const items = useAppSelector(selectAllLiterature);
  const status = useAppSelector(selectLiteratureStatus);
  const searchQuery = useAppSelector(selectLiteratureSearchQuery);
  const [activeFilter, setActiveFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    dispatch(loadLiteratureIndex({tag: activeFilter, searchQuery}));
    dispatch(loadSavedLiterature());
  }, [dispatch, activeFilter]);

  const handleSearch = (query: string) => {
    dispatch(setSearchQuery(query));
    dispatch(loadLiteratureIndex({tag: activeFilter, searchQuery: query}));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={18} color="#9E9E9E" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search guides, meditations, step study..."
          placeholderTextColor="#BDBDBD"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Icon name="close-circle" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_CHIPS.map(chip => (
          <TouchableOpacity
            key={chip.label}
            style={[
              styles.filterChip,
              activeFilter === chip.value && styles.filterChipActive,
            ]}
            onPress={() => {
              setActiveFilter(chip.value);
            }}>
            <Text
              style={[
                styles.filterChipText,
                activeFilter === chip.value && styles.filterChipTextActive,
              ]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {status === 'loading' ? (
        <ActivityIndicator size="large" color="#7B1FA2" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <LiteratureRow
              item={item}
              onPress={() =>
                navigation.navigate('LiteratureDetail', {literatureId: item.id})
              }
            />
          )}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.contributeButton}
              onPress={() => navigation.navigate('ContributeLiterature')}>
              <Icon name="add-circle-outline" size={18} color="#7B1FA2" />
              <Text style={styles.contributeButtonText}>Contribute a Resource</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="library-outline" size={48} color="#CE93D8" />
              <Text style={styles.emptyTitle}>No Resources Found</Text>
              <Text style={styles.emptyBody}>
                {searchQuery
                  ? 'Try a different search term or clear the filter.'
                  : 'The resource library is being built. Check back soon.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
    marginLeft: 8,
    marginRight: 8,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#7B1FA2',
    borderColor: '#7B1FA2',
  },
  filterChipText: {fontSize: 13, color: '#616161'},
  filterChipTextActive: {color: '#fff', fontWeight: '600'},
  listContent: {paddingHorizontal: 12, paddingBottom: 80},
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeBadgeText: {fontSize: 11, color: '#fff', fontWeight: '600'},
  programBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#E8F5E9',
    marginLeft: 6,
  },
  programBadgeText: {fontSize: 11, color: '#2E7D32', fontWeight: '600'},
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 2,
  },
  rowAuthor: {fontSize: 13, color: '#9E9E9E', marginBottom: 4},
  rowSummary: {fontSize: 13, color: '#616161', lineHeight: 18, marginBottom: 8},
  rowFooter: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  tag: {
    backgroundColor: '#F3E5F5',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: {fontSize: 11, color: '#7B1FA2'},
  emptyState: {alignItems: 'center', padding: 40},
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#616161',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
  contributeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  contributeButtonText: {
    fontSize: 14,
    color: '#7B1FA2',
    fontWeight: '600',
  },
});

export default LiteratureIndexScreen;
