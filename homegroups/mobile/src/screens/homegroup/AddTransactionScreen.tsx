import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  addTransaction,
  selectTransactionsStatus,
  selectTransactionsError,
} from '../../store/slices/transactionsSlice';
import {
  TransactionType,
  IncomeCategory,
  ExpenseCategory,
} from '../../types/domain/treasury';
import {Picker} from '@react-native-picker/picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {fetchTreasuryStats} from '../../store/slices/treasurySlice';

type AddTransactionScreenRouteProp = RouteProp<
  GroupStackParamList,
  'AddTransaction'
>;

type AddTransactionScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'AddTransaction'
>;

const AddTransactionScreen: React.FC = () => {
  const route = useRoute<AddTransactionScreenRouteProp>();
  const navigation = useNavigation<AddTransactionScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const dispatch = useAppDispatch();

  // Get status from Redux store
  const status = useAppSelector(selectTransactionsStatus);
  const error = useAppSelector(selectTransactionsError);
  const isLoading = status === 'loading';

  // Form State
  const [transactionType, setTransactionType] =
    useState<TransactionType>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<IncomeCategory | ExpenseCategory>(
    '7th Tradition',
  );
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [loading, setLoading] = useState(false);

  // Define categories based on type
  const incomeCategories: IncomeCategory[] = [
    '7th Tradition',
    'Literature Sales',
    'Event Income',
    'Group Contributions',
    'Other Income',
  ];
  const expenseCategories: ExpenseCategory[] = [
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

  const handleTypeChange = (type: TransactionType) => {
    setTransactionType(type);
    // Reset category when type changes
    setCategory(type === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date: Date) => {
    setTransactionDate(date);
    hideDatePicker();
  };

  const handleSaveTransaction = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }
    if (!category) {
      Alert.alert('Missing Category', 'Please select a category.');
      return;
    }

    setLoading(true);
    try {
      await dispatch(
        addTransaction({
          groupId,
          type: transactionType,
          amount: parsedAmount,
          category,
          description: description.trim(),
          // Serialize the Date to an ISO string so Redux never holds a Date object
          transactionDate: transactionDate.toISOString(),
        }),
      ).unwrap();

      // Refresh treasury stats after adding
      dispatch(fetchTreasuryStats(groupId));

      Alert.alert('Success', 'Transaction added successfully.');
      navigation.goBack();
    } catch (error: any) {
      console.error('Error saving transaction:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to save transaction. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const currentCategories =
    transactionType === 'income' ? incomeCategories : expenseCategories;

  return (
    <SafeAreaView
      style={styles.safeArea}
      testID={`add-transaction-screen-${groupId}`}>
      <ScrollView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{flex: 1}}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Transaction</Text>
            <Text style={styles.subtitle}>{groupName}</Text>
          </View>

          <View style={styles.formContainer}>
            {/* Transaction Type Toggle */}
            <View style={styles.typeSelectorContainer}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  transactionType === 'income' && styles.activeTypeButton,
                ]}
                onPress={() => handleTypeChange('income')}
                testID="add-tx-type-income-button">
                <Text
                  style={[
                    styles.typeButtonText,
                    transactionType === 'income' && styles.activeTypeText,
                  ]}>
                  Income
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  transactionType === 'expense' && styles.activeTypeButton,
                ]}
                onPress={() => handleTypeChange('expense')}
                testID="add-tx-type-expense-button">
                <Text
                  style={[
                    styles.typeButtonText,
                    transactionType === 'expense' && styles.activeTypeText,
                  ]}>
                  Expense
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Amount ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                testID="add-tx-amount-input"
              />
            </View>

            {/* Category */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={category}
                  onValueChange={itemValue => setCategory(itemValue as any)}
                  testID="add-tx-category-picker"
                  style={styles.picker}
                  itemStyle={styles.pickerItem}>
                  {currentCategories.map(cat => (
                    <Picker.Item key={cat} label={cat} value={cat} />
                  ))}
                </Picker>
              </View>
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="e.g., 7th Tradition, Rent for Nov, Coffee supplies"
                value={description}
                onChangeText={setDescription}
                multiline
                testID="add-tx-description-input"
              />
            </View>

            {/* Date */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                onPress={showDatePicker}
                style={styles.dateDisplay}
                testID="add-tx-date-button">
                <Text style={styles.dateDisplayText}>
                  {transactionDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.disabledButton]}
              onPress={handleSaveTransaction}
              disabled={loading}
              testID="add-tx-save-button">
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Transaction</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={transactionDate} // Start with current selected date
        onConfirm={handleConfirmDate}
        onCancel={hideDatePicker}
        maximumDate={new Date()} // Don't allow future dates
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  subtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  formContainer: {
    padding: 20,
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
  activeTypeButton: {
    backgroundColor: '#2196F3',
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
    paddingVertical: Platform.OS === 'ios' ? 12 : 8, // Adjust padding for platform
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
    overflow: 'hidden', // Needed for border radius on Android
  },
  picker: {
    height: Platform.OS === 'ios' ? 120 : 50, // iOS picker needs more height
    width: '100%',
  },
  pickerItem: {
    height: 120, // Required for iOS item visibility
    fontSize: 16,
  },
  dateDisplay: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateDisplayText: {
    fontSize: 16,
    color: '#212121',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default AddTransactionScreen;
