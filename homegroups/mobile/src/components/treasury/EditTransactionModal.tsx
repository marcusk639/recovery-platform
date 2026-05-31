import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  updateTransaction,
  selectTransactionsUpdating,
} from '../../store/slices/transactionsSlice';
import {fetchTreasuryStats} from '../../store/slices/treasurySlice';
import {
  Transaction,
  TransactionType,
  IncomeCategory,
  ExpenseCategory,
} from '../../types/domain/treasury';

interface EditTransactionModalProps {
  visible: boolean;
  transaction: Transaction | null;
  groupId: string;
  onClose: () => void;
}

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

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  groupId,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const updating = useAppSelector(selectTransactionsUpdating);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IncomeCategory | ExpenseCategory>(
    '7th Tradition',
  );

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description || '');
      setCategory(transaction.category as IncomeCategory | ExpenseCategory);
    }
  }, [transaction]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    // Reset category when type changes
    if (newType === 'income') {
      setCategory(INCOME_CATEGORIES[0]);
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
    }
  };

  const handleSave = async () => {
    if (!transaction) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }

    if (!category) {
      Alert.alert('Missing Category', 'Please select a category.');
      return;
    }

    try {
      await dispatch(
        updateTransaction({
          transactionId: transaction.id,
          groupId,
          updates: {
            type,
            amount: parsedAmount,
            description: description.trim(),
            category,
          },
        }),
      ).unwrap();

      // Refresh treasury stats after updating
      dispatch(fetchTreasuryStats(groupId));

      Alert.alert('Success', 'Transaction updated successfully.');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error || 'Failed to update transaction');
    }
  };

  const currentCategories =
    type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="edit-transaction-modal">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            disabled={updating}
            testID="edit-tx-cancel-button">
            <Text
              style={[styles.cancelButton, updating && styles.disabledText]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Transaction</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={updating}
            testID="edit-tx-save-button">
            {updating ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <Text style={styles.saveButton}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} testID="edit-tx-form">
          {/* Type Selector */}
          <View style={styles.typeSelectorContainer}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'income' && styles.activeIncomeButton,
              ]}
              onPress={() => handleTypeChange('income')}
              disabled={updating}
              testID="edit-tx-type-income-button">
              <Text
                style={[
                  styles.typeButtonText,
                  type === 'income' && styles.activeTypeText,
                ]}>
                Income
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'expense' && styles.activeExpenseButton,
              ]}
              onPress={() => handleTypeChange('expense')}
              disabled={updating}
              testID="edit-tx-type-expense-button">
              <Text
                style={[
                  styles.typeButtonText,
                  type === 'expense' && styles.activeTypeText,
                ]}>
                Expense
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount ($)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9E9E9E"
              editable={!updating}
              testID="edit-tx-amount-input"
            />
          </View>

          {/* Category Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={category}
                onValueChange={itemValue =>
                  setCategory(itemValue as IncomeCategory | ExpenseCategory)
                }
                enabled={!updating}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                testID="edit-tx-category-picker">
                {currentCategories.map(cat => (
                  <Picker.Item key={cat} label={cat} value={cat} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor="#9E9E9E"
              multiline
              editable={!updating}
              testID="edit-tx-description-input"
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
  },
  cancelButton: {
    fontSize: 17,
    color: '#1976D2',
  },
  saveButton: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1976D2',
  },
  disabledText: {
    opacity: 0.5,
  },
  form: {
    padding: 16,
  },
  typeSelectorContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#EEEEEE',
    borderRadius: 8,
    overflow: 'hidden',
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeIncomeButton: {
    backgroundColor: '#4CAF50',
  },
  activeExpenseButton: {
    backgroundColor: '#F44336',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  activeTypeText: {
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 16,
    color: '#212121',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: {
    height: Platform.OS === 'ios' ? 120 : 50,
    width: '100%',
  },
  pickerItem: {
    height: 120,
    fontSize: 16,
  },
  historyInfo: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  historyLabel: {
    fontSize: 13,
    color: '#1565C0',
    fontStyle: 'italic',
  },
});

export default EditTransactionModal;
