import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';

const TERM_OPTIONS: Array<{label: string; value: number | null}> = [
  {label: '3 months', value: 3},
  {label: '6 months', value: 6},
  {label: '1 year', value: 12},
  {label: '2 years', value: 24},
  {label: 'No set term', value: null},
];
import {useRoute, useNavigation, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch} from '../../store';
import {
  createServicePosition,
  updateServicePosition,
} from '../../store/slices/servicePositionsSlice';
import {ServicePosition} from '../../types';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'AddEditServicePosition'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'AddEditServicePosition'
>;

interface AddEditServicePositionScreenProps {
  route: ScreenRouteProp;
  navigation: ScreenNavigationProp;
}

const AddEditServicePositionScreen: React.FC<
  AddEditServicePositionScreenProps
> = ({route, navigation}) => {
  const {groupId, positionId, position} = route.params;
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end'>(
    'start',
  );
  const [showTermPicker, setShowTermPicker] = useState(false);

  const [formData, setFormData] = useState<Partial<ServicePosition>>({
    name: '',
    description: '',
    termStartDate: new Date(),
    termEndDate: undefined,
    commitmentLength: 0,
    currentHolderId: null,
    currentHolderName: null,
  });

  useEffect(() => {
    if (position) {
      setFormData({
        name: position.name,
        description: position.description,
        termStartDate: position.termStartDate,
        termEndDate: position.termEndDate,
        commitmentLength: position.commitmentLength,
        currentHolderId: position.currentHolderId,
        currentHolderName: position.currentHolderName,
      });
    }
  }, [position]);

  const handleSubmit = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Position name is required');
      return;
    }

    try {
      setLoading(true);
      if (positionId) {
        await dispatch(
          updateServicePosition({
            groupId,
            positionId,
            updateData: formData as Partial<ServicePosition>,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createServicePosition({
            groupId,
            name: formData.name,
            description: formData.description,
            commitmentLength: formData.commitmentLength,
            termStartDate: formData.termStartDate || undefined,
            termEndDate: formData.termEndDate || undefined,
          }),
        ).unwrap();
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save service position');
    } finally {
      setLoading(false);
    }
  };

  const handleTermSelect = (months: number | null) => {
    setShowTermPicker(false);
    const startDate = formData.termStartDate || new Date();
    const endDate =
      months !== null
        ? new Date(startDate.getTime() + months * 30 * 24 * 60 * 60 * 1000)
        : undefined;
    setFormData(prev => ({
      ...prev,
      commitmentLength: months ?? 0,
      termEndDate: endDate,
    }));
  };

  const selectedTermLabel =
    TERM_OPTIONS.find(opt => opt.value === formData.commitmentLength)?.label ||
    (formData.commitmentLength
      ? `${formData.commitmentLength} months`
      : 'Select term length');

  const handleDateChange = (selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({
        ...prev,
        [datePickerMode === 'start' ? 'termStartDate' : 'termEndDate']:
          selectedDate,
      }));
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Position Name</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={text => setFormData(prev => ({...prev, name: text}))}
            placeholder="Enter position name"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description}
            onChangeText={text =>
              setFormData(prev => ({...prev, description: text}))
            }
            placeholder="Enter position description"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Term Start Date</Text>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => {
              setDatePickerMode('start');
              setShowDatePicker(true);
            }}>
            <Text>
              {formData.termStartDate?.toLocaleDateString() || 'Select date'}
            </Text>
            <Icon name="calendar" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Term End Date (Optional)</Text>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => {
              setDatePickerMode('end');
              setShowDatePicker(true);
            }}>
            <Text>
              {formData.termEndDate?.toLocaleDateString() || 'Select date'}
            </Text>
            <Icon name="calendar" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Term Length</Text>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => setShowTermPicker(true)}>
            <Text>{selectedTermLabel}</Text>
            <Icon name="chevron-down" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>

        <Modal
          visible={showTermPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTermPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Term Length</Text>
              <FlatList
                data={TERM_OPTIONS}
                keyExtractor={item => String(item.value)}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.termOption}
                    onPress={() => handleTermSelect(item.value)}>
                    <Text style={styles.termOptionText}>{item.label}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          date={
            datePickerMode === 'start'
              ? formData.termStartDate || new Date()
              : formData.termEndDate || new Date()
          }
          onConfirm={handleDateChange}
          onCancel={() => setShowDatePicker(false)}
        />

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              {positionId ? 'Update Position' : 'Create Position'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  submitButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '50%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  termOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  termOptionText: {
    fontSize: 16,
    color: '#212121',
  },
});

export default AddEditServicePositionScreen;
