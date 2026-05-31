---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-mvp-p0-transaction-editing.md
---

# Treasury Transaction Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow treasurers to edit existing transactions instead of requiring delete-and-recreate for typo fixes.

**Architecture:** Add edit capability to existing transaction model. Update Firestore rules to allow updates by admin/treasurer. Add edit modal UI. Track edit history for audit trail.

**Tech Stack:** React Native, Redux Toolkit, Firestore, React Hook Form

**Priority:** P0 - MVP Blocker
**Estimated Effort:** 3-4 hours
**Revenue Impact:** Conversion - Treasurers will reject the app without this basic functionality

---

## Task 1: Update Transaction Schema for Edit Tracking

**Files:**
- Modify: `mobile/src/types/schema.ts`
- Modify: `mobile/src/types/domain/treasury.ts`

**Step 1: Add edit tracking fields to TransactionDocument**

In `mobile/src/types/schema.ts`:

```typescript
export interface TransactionDocument {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  groupId: string;

  // NEW: Edit tracking
  updatedAt?: FirebaseFirestoreTypes.Timestamp;
  updatedBy?: string;
  editHistory?: {
    editedAt: FirebaseFirestoreTypes.Timestamp;
    editedBy: string;
    previousValues: {
      amount?: number;
      description?: string;
      category?: string;
      type?: 'income' | 'expense';
    };
  }[];
}
```

**Step 2: Update domain type**

In `mobile/src/types/domain/treasury.ts`, ensure Transaction type matches:

```typescript
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  createdBy: string;
  createdAt: Date;
  groupId: string;
  updatedAt?: Date;
  updatedBy?: string;
  editHistory?: EditHistoryEntry[];
}

export interface EditHistoryEntry {
  editedAt: Date;
  editedBy: string;
  previousValues: Partial<Pick<Transaction, 'amount' | 'description' | 'category' | 'type'>>;
}
```

**Step 3: Commit**

```bash
git add mobile/src/types/schema.ts mobile/src/types/domain/treasury.ts
git commit -m "feat(treasury): add schema for transaction edit tracking"
```

---

## Task 2: Update Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Allow transaction updates by admin or treasurer**

Update the transactions collection rules:

```javascript
match /transactions/{transactionId} {
  // Allow read by group members
  allow read: if isGroupMember(resource.data.groupId);

  // Allow create by admin or treasurer
  allow create: if isGroupAdminOrTreasurer(request.resource.data.groupId);

  // Allow update by admin or treasurer (for editing)
  allow update: if isGroupAdminOrTreasurer(resource.data.groupId)
    // Prevent changing groupId or createdBy
    && request.resource.data.groupId == resource.data.groupId
    && request.resource.data.createdBy == resource.data.createdBy
    && request.resource.data.createdAt == resource.data.createdAt;

  // Allow delete by admin or treasurer
  allow delete: if isGroupAdminOrTreasurer(resource.data.groupId);
}
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat(treasury): allow transaction updates in security rules"
```

---

## Task 3: Add Update Transaction Function to Model

**Files:**
- Modify: `mobile/src/models/TransactionModel.ts` (or equivalent)

**Step 1: Add updateTransaction function**

```typescript
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export interface UpdateTransactionData {
  amount?: number;
  description?: string;
  category?: string;
  type?: 'income' | 'expense';
}

export async function updateTransaction(
  transactionId: string,
  updates: UpdateTransactionData,
): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated');
  }

  const transactionRef = firestore().collection('transactions').doc(transactionId);
  const transactionDoc = await transactionRef.get();

  if (!transactionDoc.exists) {
    throw new Error('Transaction not found');
  }

  const currentData = transactionDoc.data();
  const now = firestore.Timestamp.now();

  // Build edit history entry
  const previousValues: any = {};
  if (updates.amount !== undefined && updates.amount !== currentData?.amount) {
    previousValues.amount = currentData?.amount;
  }
  if (updates.description !== undefined && updates.description !== currentData?.description) {
    previousValues.description = currentData?.description;
  }
  if (updates.category !== undefined && updates.category !== currentData?.category) {
    previousValues.category = currentData?.category;
  }
  if (updates.type !== undefined && updates.type !== currentData?.type) {
    previousValues.type = currentData?.type;
  }

  // Only update if there are actual changes
  if (Object.keys(previousValues).length === 0) {
    return; // No changes
  }

  const editHistoryEntry = {
    editedAt: now,
    editedBy: currentUser.uid,
    previousValues,
  };

  await transactionRef.update({
    ...updates,
    updatedAt: now,
    updatedBy: currentUser.uid,
    editHistory: firestore.FieldValue.arrayUnion(editHistoryEntry),
  });
}
```

**Step 2: Commit**

```bash
git add mobile/src/models/TransactionModel.ts
git commit -m "feat(treasury): add updateTransaction function with edit history"
```

---

## Task 4: Add Redux Thunk for Updating Transactions

**Files:**
- Modify: `mobile/src/store/slices/transactionsSlice.ts`

**Step 1: Add updateTransaction async thunk**

```typescript
import { updateTransaction as updateTransactionModel, UpdateTransactionData } from '../../models/TransactionModel';
import { trackActivity } from '../../services/activityTracker';

export const updateTransaction = createAsyncThunk(
  'transactions/updateTransaction',
  async (
    { transactionId, groupId, updates }: {
      transactionId: string;
      groupId: string;
      updates: UpdateTransactionData
    },
    { rejectWithValue }
  ) => {
    try {
      await updateTransactionModel(transactionId, updates);

      // Track activity for admin status
      const currentUser = auth().currentUser;
      if (currentUser) {
        trackActivity(currentUser.uid, 'treasury_action', groupId);
      }

      return { transactionId, updates };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);
```

**Step 2: Add reducer case**

```typescript
extraReducers: (builder) => {
  // ... existing reducers ...

  builder
    .addCase(updateTransaction.pending, (state) => {
      state.updating = true;
      state.error = null;
    })
    .addCase(updateTransaction.fulfilled, (state, action) => {
      state.updating = false;
      const { transactionId, updates } = action.payload;
      // Update the transaction in state
      const index = state.transactions.findIndex(t => t.id === transactionId);
      if (index !== -1) {
        state.transactions[index] = {
          ...state.transactions[index],
          ...updates,
          updatedAt: new Date(),
        };
      }
    })
    .addCase(updateTransaction.rejected, (state, action) => {
      state.updating = false;
      state.error = action.payload as string;
    });
}
```

**Step 3: Add state fields if not present**

```typescript
interface TransactionsState {
  // ... existing fields ...
  updating: boolean;
}

const initialState: TransactionsState = {
  // ... existing fields ...
  updating: false,
};
```

**Step 4: Commit**

```bash
git add mobile/src/store/slices/transactionsSlice.ts
git commit -m "feat(treasury): add Redux thunk for updating transactions"
```

---

## Task 5: Create Edit Transaction Modal

**Files:**
- Create: `mobile/src/components/treasury/EditTransactionModal.tsx`

**Step 1: Create the modal component**

```typescript
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { updateTransaction } from '../../store/slices/transactionsSlice';
import { Transaction } from '../../types/domain/treasury';
import { Picker } from '@react-native-picker/picker';

interface EditTransactionModalProps {
  visible: boolean;
  transaction: Transaction | null;
  groupId: string;
  onClose: () => void;
}

const INCOME_CATEGORIES = ['7th Tradition', 'Literature Sales', 'Events', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent', 'Literature', 'Supplies', 'Service Contributions', 'Events', 'Other Expense'];

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  groupId,
  onClose,
}) => {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const { updating } = useAppSelector(state => state.transactions);

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setCategory(transaction.category);
    }
  }, [transaction]);

  const handleSave = async () => {
    if (!transaction) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    if (!category) {
      Alert.alert('Error', 'Please select a category');
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
        })
      ).unwrap();

      Alert.alert('Success', 'Transaction updated successfully');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error || 'Failed to update transaction');
    }
  };

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancelButton, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Edit Transaction</Text>
          <TouchableOpacity onPress={handleSave} disabled={updating}>
            <Text style={[styles.saveButton, { color: colors.primary, opacity: updating ? 0.5 : 1 }]}>
              {updating ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form}>
          {/* Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'income' && { backgroundColor: colors.success },
              ]}
              onPress={() => setType('income')}
            >
              <Text style={[styles.typeText, type === 'income' && { color: colors.white }]}>
                Income
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'expense' && { backgroundColor: colors.error },
              ]}
              onPress={() => setType('expense')}
            >
              <Text style={[styles.typeText, type === 'expense' && { color: colors.white }]}>
                Expense
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Amount</Text>
            <View style={[styles.amountInput, { borderColor: colors.border }]}>
              <Text style={[styles.currencySymbol, { color: colors.text }]}>$</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.textInput, { borderColor: colors.border, color: colors.text }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Category Picker */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
            <View style={[styles.pickerContainer, { borderColor: colors.border }]}>
              <Picker
                selectedValue={category}
                onValueChange={setCategory}
                style={{ color: colors.text }}
              >
                <Picker.Item label="Select category" value="" />
                {categories.map((cat) => (
                  <Picker.Item key={cat} label={cat} value={cat} />
                ))}
              </Picker>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelButton: {
    fontSize: 17,
  },
  saveButton: {
    fontSize: 17,
    fontWeight: '600',
  },
  form: {
    padding: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f0f0f0',
  },
  typeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 18,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    padding: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
  },
});

export default EditTransactionModal;
```

**Step 2: Commit**

```bash
git add mobile/src/components/treasury/EditTransactionModal.tsx
git commit -m "feat(treasury): create EditTransactionModal component"
```

---

## Task 6: Add Edit Button to Transaction List Item

**Files:**
- Modify: `mobile/src/components/treasury/TransactionItem.tsx` (or wherever transactions are rendered)

**Step 1: Add edit button/action to transaction item**

```typescript
// Add to the transaction item component

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transactionId: string) => void;
  canEdit: boolean; // true if user is admin or treasurer
}

// In the render, add an edit button:
{canEdit && (
  <TouchableOpacity
    style={styles.editButton}
    onPress={() => onEdit(transaction)}
  >
    <Icon name="pencil" size={18} color={colors.primary} />
  </TouchableOpacity>
)}
```

**Step 2: Commit**

```bash
git add mobile/src/components/treasury/TransactionItem.tsx
git commit -m "feat(treasury): add edit button to transaction items"
```

---

## Task 7: Integrate Edit Modal in Treasury Screen

**Files:**
- Modify: `mobile/src/screens/homegroup/TreasuryScreen.tsx`

**Step 1: Add state and modal integration**

```typescript
import { EditTransactionModal } from '../../components/treasury/EditTransactionModal';

// Inside TreasuryScreen component:
const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
const [editModalVisible, setEditModalVisible] = useState(false);

const handleEditTransaction = (transaction: Transaction) => {
  setEditingTransaction(transaction);
  setEditModalVisible(true);
};

const handleCloseEditModal = () => {
  setEditModalVisible(false);
  setEditingTransaction(null);
};

// In the render:
<EditTransactionModal
  visible={editModalVisible}
  transaction={editingTransaction}
  groupId={groupId}
  onClose={handleCloseEditModal}
/>

// Pass handleEditTransaction to transaction list:
<TransactionList
  transactions={transactions}
  onEdit={handleEditTransaction}
  onDelete={handleDeleteTransaction}
  canEdit={isAdminOrTreasurer}
/>
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/TreasuryScreen.tsx
git commit -m "feat(treasury): integrate edit modal in Treasury screen"
```

---

## Task 8: Add Activity Tracking to Add/Delete

**Files:**
- Modify: `mobile/src/store/slices/transactionsSlice.ts`

**Step 1: Add activity tracking to existing thunks**

For `addTransaction`:
```typescript
// After successful creation:
const currentUser = auth().currentUser;
if (currentUser) {
  trackActivity(currentUser.uid, 'treasury_action', groupId);
}
```

For `deleteTransaction`:
```typescript
// After successful deletion:
const currentUser = auth().currentUser;
if (currentUser) {
  trackActivity(currentUser.uid, 'treasury_action', groupId);
}
```

**Step 2: Commit**

```bash
git add mobile/src/store/slices/transactionsSlice.ts
git commit -m "feat(treasury): add activity tracking to all transaction actions"
```

---

## Task 9: Verification & Testing

**Step 1: Manual testing checklist**

Run the app and verify:

- [ ] Edit button appears on transactions for admin/treasurer users
- [ ] Edit button does NOT appear for regular members
- [ ] Clicking edit opens modal with pre-filled values
- [ ] Can change type from income to expense and vice versa
- [ ] Can change amount, description, category
- [ ] Saving updates the transaction immediately in the list
- [ ] Cancel closes modal without saving
- [ ] Invalid amount shows error
- [ ] Empty description shows error

**Step 2: Test edge cases**

- [ ] Edit history is saved in Firestore (check document directly)
- [ ] Multiple edits append to editHistory array
- [ ] Cannot edit transactions from other groups (security rules)
- [ ] Regular member cannot edit (security rules)

**Step 3: Verify treasury balance updates**

- [ ] Changing amount updates treasury balance correctly
- [ ] Changing type (income→expense) updates balance correctly

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(treasury): complete transaction editing implementation"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the treasury transaction editing implementation:

1. TEST FUNCTIONALITY:
   - Create a test transaction (income, $100, "Test")
   - Edit it: change to expense, $50, "Edited Test"
   - Verify the transaction list shows updated values
   - Verify treasury balance updated correctly
   - Check Firestore document has editHistory entry

2. TEST SECURITY:
   - Log in as regular member (not admin/treasurer)
   - Verify edit button is not visible
   - Try to call updateTransaction directly - should fail

3. CHECK CODE QUALITY:
   - Run: `npx tsc --noEmit` - fix any TypeScript errors
   - Run the app and check for console warnings
   - Verify form validation works (empty fields, invalid amounts)

4. TEST ACTIVITY TRACKING:
   - Edit a transaction
   - Verify admin activity was updated (check group.adminDetails in Firestore)

5. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
