// mobile/src/screens/homegroup/ManageRecurringScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useRoute, RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchRecurringTransactions,
  createRecurringTransaction,
  toggleRecurringActive,
  deleteRecurringTransaction,
  selectRecurringByGroup,
  selectRecurringStatus,
} from '../../store/slices/recurringTransactionsSlice';
import {RecurrenceFrequency} from '../../types/domain/recurring-transaction';
import {IncomeCategory, ExpenseCategory} from '../../types/domain/treasury';

type RouteProps = RouteProp<GroupStackParamList, 'ManageRecurring'>;

const INCOME_CATEGORIES: IncomeCategory[] = [
  '7th Tradition',
  'Literature Sales',
  'Event Income',
  'Group Contributions',
  'Other Income',
];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Literature',
  'Refreshments',
  'Events',
  'Contributions to Service Bodies',
  'Area Contribution',
  'Region Contribution',
  'World Service',
  'Supplies',
  'Printing',
  'Insurance',
  'Other Expenses',
];
const FREQUENCIES: {label: string; value: RecurrenceFrequency}[] = [
  {label: 'Weekly', value: 'weekly'},
  {label: 'Monthly', value: 'monthly'},
  {label: 'Quarterly', value: 'quarterly'},
  {label: 'Yearly', value: 'yearly'},
];

const ManageRecurringScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const {groupId} = route.params;
  const dispatch = useAppDispatch();
  const items = useAppSelector(state => selectRecurringByGroup(state, groupId));
  const status = useAppSelector(selectRecurringStatus);

  const [modalVisible, setModalVisible] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchRecurringTransactions(groupId));
  }, [dispatch, groupId]);

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Error', 'Please fill in all fields with a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await dispatch(
        createRecurringTransaction({
          groupId,
          type: txType,
          amount: parsed,
          description: description.trim(),
          category,
          frequency,
          startDate: new Date(),
        }),
      ).unwrap();
      setModalVisible(false);
      setAmount('');
      setDescription('');
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to create recurring transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    dispatch(toggleRecurringActive({id, isActive: !isActive}));
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Stop this recurring transaction?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => dispatch(deleteRecurringTransaction(id)),
      },
    ]);
  };

  const renderItem = ({item}: any) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <Switch
          value={item.isActive}
          onValueChange={() => handleToggle(item.id, item.isActive)}
        />
      </View>
      <Text style={styles.cardMeta}>
        {item.type === 'income' ? '+' : '-'}${item.amount.toFixed(2)} ·{' '}
        {item.category} · {item.frequency}
      </Text>
      <Text style={styles.cardNext}>
        Next: {new Date(item.nextDate).toLocaleDateString()}
      </Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}>
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          status === 'loading' ? (
            <ActivityIndicator style={{marginTop: 40}} />
          ) : (
            <Text style={styles.empty}>No recurring transactions yet.</Text>
          )
        }
        contentContainerStyle={{padding: 16, flexGrow: 1}}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Recurring Transaction</Text>
            {/* Type selector */}
            <View style={styles.typeRow}>
              {(['income', 'expense'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, txType === t && styles.typeBtnActive]}
                  onPress={() => {
                    setTxType(t);
                    setCategory(
                      t === 'income'
                        ? INCOME_CATEGORIES[0]
                        : EXPENSE_CATEGORIES[0],
                    );
                  }}>
                  <Text
                    style={[
                      styles.typeBtnText,
                      txType === t && styles.typeBtnTextActive,
                    ]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Description (e.g. Meeting hall rent)"
              value={description}
              onChangeText={setDescription}
            />
            <Picker
              selectedValue={category}
              onValueChange={v => setCategory(v)}>
              {(txType === 'income'
                ? INCOME_CATEGORIES
                : EXPENSE_CATEGORIES
              ).map(c => (
                <Picker.Item key={c} label={c} value={c} />
              ))}
            </Picker>
            <Picker
              selectedValue={frequency}
              onValueChange={v => setFrequency(v as RecurrenceFrequency)}>
              {FREQUENCIES.map(f => (
                <Picker.Item key={f.value} label={f.label} value={f.value} />
              ))}
            </Picker>
            <TouchableOpacity
              style={[styles.saveBtn, saving && {opacity: 0.6}]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {fontSize: 15, fontWeight: '600', color: '#333', flex: 1},
  cardMeta: {fontSize: 13, color: '#666', marginTop: 4},
  cardNext: {fontSize: 12, color: '#888', marginTop: 2},
  deleteBtn: {marginTop: 8, alignSelf: 'flex-end'},
  deleteBtnText: {color: '#e74c3c', fontSize: 13},
  empty: {textAlign: 'center', color: '#999', marginTop: 60},
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#2196F3',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  fabText: {color: '#fff', fontSize: 28, lineHeight: 32},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#333',
  },
  typeRow: {flexDirection: 'row', marginBottom: 12, gap: 8},
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  typeBtnActive: {backgroundColor: '#2196F3', borderColor: '#2196F3'},
  typeBtnText: {color: '#555'},
  typeBtnTextActive: {color: '#fff', fontWeight: '600'},
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  cancelBtn: {marginTop: 10, padding: 12, alignItems: 'center'},
  cancelBtnText: {color: '#666'},
});

export default ManageRecurringScreen;
