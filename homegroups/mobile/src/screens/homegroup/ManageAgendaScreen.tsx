import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  selectAgendaItems,
  addAgendaItem,
  updateAgendaItem,
  removeAgendaItem,
  reorderAgendaItems,
} from '../../store/slices/businessMeetingsSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {AgendaItem} from '../../types/domain/business-meeting';

type ManageAgendaScreenRouteProp = RouteProp<
  GroupStackParamList,
  'ManageAgenda'
>;
type ManageAgendaScreenNavigationProp =
  StackNavigationProp<GroupStackParamList>;

type AgendaItemType = AgendaItem['type'];
const AGENDA_TYPES: {value: AgendaItemType; label: string}[] = [
  {value: 'old_business', label: 'Old Business'},
  {value: 'new_business', label: 'New Business'},
  {value: 'report', label: 'Report'},
  {value: 'election', label: 'Election'},
  {value: 'other', label: 'Other'},
];

const ManageAgendaScreen: React.FC = () => {
  const route = useRoute<ManageAgendaScreenRouteProp>();
  const navigation = useNavigation<ManageAgendaScreenNavigationProp>();
  const {groupId, meetingId} = route.params;

  const dispatch = useAppDispatch();

  // Get data from Redux store
  const agendaItems = useAppSelector(state =>
    selectAgendaItems(state, meetingId),
  );
  const members = useAppSelector(state =>
    selectMembersByGroupId(state, groupId),
  );

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<AgendaItemType>('new_business');
  const [presenter, setPresenter] = useState('');
  const [timeAllotted, setTimeAllotted] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Presenter picker
  const [showPresenterPicker, setShowPresenterPicker] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('new_business');
    setPresenter('');
    setTimeAllotted('');
    setEditingItem(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (item: AgendaItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setType(item.type);
    setPresenter(item.presenter);
    setTimeAllotted(item.timeAllotted?.toString() || '');
    setModalVisible(true);
  };

  const getMemberName = (userId: string): string => {
    const member = members.find(m => m.userId === userId || m.id === userId);
    return member?.name || 'Unknown';
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert(
        'Validation Error',
        'Please enter a title for the agenda item.',
      );
      return;
    }
    if (!presenter) {
      Alert.alert('Validation Error', 'Please select a presenter.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await dispatch(
          updateAgendaItem({
            meetingId,
            itemId: editingItem.id,
            updates: {
              title: title.trim(),
              description: description.trim() || undefined,
              type,
              presenter,
              timeAllotted: timeAllotted
                ? parseInt(timeAllotted, 10)
                : undefined,
            },
          }),
        ).unwrap();
        Alert.alert('Success', 'Agenda item updated.');
      } else {
        const order = agendaItems.length;
        await dispatch(
          addAgendaItem({
            meetingId,
            item: {
              title: title.trim(),
              description: description.trim() || undefined,
              type,
              presenter,
              timeAllotted: timeAllotted
                ? parseInt(timeAllotted, 10)
                : undefined,
              order,
              status: 'pending',
            },
          }),
        ).unwrap();
        Alert.alert('Success', 'Agenda item added.');
      }
      setModalVisible(false);
      resetForm();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save agenda item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item: AgendaItem) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.title}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(
                removeAgendaItem({meetingId, itemId: item.id}),
              ).unwrap();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete agenda item.');
            }
          },
        },
      ],
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;

    const items = [...agendaItems];
    const temp = items[index];
    items[index] = items[index - 1];
    items[index - 1] = temp;

    const itemOrders = items.map((item, i) => ({id: item.id, order: i}));
    try {
      await dispatch(reorderAgendaItems({meetingId, itemOrders})).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to reorder items.');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === agendaItems.length - 1) return;

    const items = [...agendaItems];
    const temp = items[index];
    items[index] = items[index + 1];
    items[index + 1] = temp;

    const itemOrders = items.map((item, i) => ({id: item.id, order: i}));
    try {
      await dispatch(reorderAgendaItems({meetingId, itemOrders})).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to reorder items.');
    }
  };

  const getTypeLabel = (t: AgendaItemType): string => {
    return AGENDA_TYPES.find(at => at.value === t)?.label || t;
  };

  const getTypeColor = (t: AgendaItemType): string => {
    switch (t) {
      case 'old_business':
        return '#9E9E9E';
      case 'new_business':
        return '#2196F3';
      case 'report':
        return '#4CAF50';
      case 'election':
        return '#FF9800';
      default:
        return '#757575';
    }
  };

  const renderAgendaItem = ({
    item,
    index,
  }: {
    item: AgendaItem;
    index: number;
  }) => (
    <View style={styles.agendaCard}>
      <View style={styles.cardHeader}>
        <View style={styles.orderContainer}>
          <Text style={styles.orderNumber}>{index + 1}</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <View style={styles.itemMeta}>
            <View
              style={[
                styles.typeBadge,
                {backgroundColor: getTypeColor(item.type)},
              ]}>
              <Text style={styles.typeBadgeText}>
                {getTypeLabel(item.type)}
              </Text>
            </View>
            {item.timeAllotted && (
              <Text style={styles.timeText}>{item.timeAllotted} min</Text>
            )}
          </View>
          <Text style={styles.presenterText}>
            Presenter: {getMemberName(item.presenter)}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            style={[styles.reorderButton, index === 0 && styles.disabledButton]}
            onPress={() => handleMoveUp(index)}
            disabled={index === 0}>
            <Icon
              name="chevron-up"
              size={24}
              color={index === 0 ? '#BDBDBD' : '#757575'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.reorderButton,
              index === agendaItems.length - 1 && styles.disabledButton,
            ]}
            onPress={() => handleMoveDown(index)}
            disabled={index === agendaItems.length - 1}>
            <Icon
              name="chevron-down"
              size={24}
              color={index === agendaItems.length - 1 ? '#BDBDBD' : '#757575'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.editButtons}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(item)}>
            <Icon name="pencil" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}>
            <Icon name="delete" size={20} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={agendaItems}
        keyExtractor={item => item.id}
        renderItem={renderAgendaItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="clipboard-text-outline" size={64} color="#BDBDBD" />
            <Text style={styles.emptyTitle}>No Agenda Items</Text>
            <Text style={styles.emptyText}>
              Tap the button below to add items to the agenda.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Icon name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Agenda Item' : 'Add Agenda Item'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Enter agenda item title"
                maxLength={100}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Enter description (optional)"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles.inputLabel}>Type *</Text>
              <View style={styles.typeContainer}>
                {AGENDA_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.typeOption,
                      type === t.value && styles.typeOptionSelected,
                    ]}
                    onPress={() => setType(t.value)}>
                    <Text
                      style={[
                        styles.typeOptionText,
                        type === t.value && styles.typeOptionTextSelected,
                      ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Presenter *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPresenterPicker(true)}>
                <Text
                  style={[
                    styles.pickerButtonText,
                    !presenter && styles.placeholder,
                  ]}>
                  {presenter ? getMemberName(presenter) : 'Select presenter...'}
                </Text>
                <Icon name="chevron-right" size={24} color="#BDBDBD" />
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Time Allotted (minutes)</Text>
              <TextInput
                style={styles.textInput}
                value={timeAllotted}
                onChangeText={setTimeAllotted}
                placeholder="e.g., 10"
                keyboardType="numeric"
                maxLength={3}
              />

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  submitting && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingItem ? 'Save Changes' : 'Add Item'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Presenter Picker Modal */}
      <Modal
        visible={showPresenterPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPresenterPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Presenter</Text>
              <TouchableOpacity
                onPress={() => setShowPresenterPicker(false)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={members}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => {
                    setPresenter(item.userId || item.id);
                    setShowPresenterPicker(false);
                  }}>
                  <Icon name="account" size={24} color="#757575" />
                  <Text style={styles.memberName}>{item.name}</Text>
                  {(item.userId === presenter || item.id === presenter) && (
                    <Icon name="check" size={24} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyListText}>No members found</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  agendaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  orderContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  cardContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 12,
    color: '#757575',
  },
  presenterText: {
    fontSize: 13,
    color: '#757575',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  reorderButtons: {
    flexDirection: 'row',
  },
  reorderButton: {
    padding: 4,
    marginRight: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  editButtons: {
    flexDirection: 'row',
  },
  editButton: {
    padding: 8,
    marginRight: 8,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212121',
  },
  textArea: {
    minHeight: 80,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  typeOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    marginBottom: 8,
  },
  typeOptionSelected: {
    backgroundColor: '#2196F3',
  },
  typeOptionText: {
    fontSize: 14,
    color: '#757575',
  },
  typeOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#212121',
  },
  placeholder: {
    color: '#9E9E9E',
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 16,
  },
  emptyListText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    padding: 32,
  },
});

export default ManageAgendaScreen;
