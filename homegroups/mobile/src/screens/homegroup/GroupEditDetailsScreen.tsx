import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {GroupModel} from '../../models/GroupModel';
import {Button} from '../../components/common/Button';
import {auth} from '../../services/firebase/config';
import DateTimePicker from '@react-native-community/datetimepicker';
import LocationPicker, {
  LocationProps,
} from '../../components/groups/LocationPicker';
import {updateGroup} from '../../store/slices/groupsSlice';
import {
  fetchTreasuryStats,
  selectTreasuryStatsByGroupId,
  updatePrudentReserve,
} from '../../store/slices/treasurySlice';
import {useAppDispatch, useAppSelector} from '../../store';

type GroupEditDetailsScreenProps = {
  navigation: StackNavigationProp<GroupStackParamList, 'GroupEditDetails'>;
  route: RouteProp<GroupStackParamList, 'GroupEditDetails'>;
};

const GroupEditDetailsScreen: React.FC<GroupEditDetailsScreenProps> = ({
  navigation,
  route,
}) => {
  const {groupId, groupName} = route.params;
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const dispatch = useAppDispatch();
  const treasuryStats = useAppSelector(state =>
    selectTreasuryStatsByGroupId(state, groupId),
  );
  // Form state
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [prudentReserveInput, setPrudentReserveInput] = useState<string>('600');
  const [prudentReserveError, setPrudentReserveError] = useState<string>('');
  // const [meetingDay, setMeetingDay] = useState<string>('');
  // const [meetingTime, setMeetingTime] = useState<Date>(new Date());
  const [location, setLocation] = useState<LocationProps>({
    address: '',
    latitude: 0,
    longitude: 0,
    placeName: '',
  });
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [publicDescription, setPublicDescription] = useState<string>('');
  const [publicProfileEnabled, setPublicProfileEnabled] =
    useState<boolean>(true);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const prudentReserveInitialized = useRef(false);

  // Load group data
  useEffect(() => {
    const loadGroupData = async () => {
      try {
        setLoading(true);

        // Get group details
        const groupData = await GroupModel.getById(groupId);

        if (groupData) {
          setGroup(groupData);
          setName(groupData.name || '');
          setDescription(groupData.description || '');
          // setMeetingDay(groupData.meetingDay || '');
          // setMeetingTime(
          //   groupData.meetingTime
          //     ? new Date(groupData.meetingTime)
          //     : new Date(),
          // );
          setLocation({
            address: groupData.address || '',
            latitude: groupData.lat || 0,
            longitude: groupData.lng || 0,
            placeName: groupData.location || '',
          });
          setIsPublic(groupData.isPublic ?? false);
          setPublicDescription(groupData.publicDescription || '');
          setPublicProfileEnabled(groupData.publicProfileEnabled ?? true);

          // Check if current user is admin
          setIsAdmin(
            groupData.admins?.includes(auth.currentUser?.uid || '') || false,
          );

          if (!groupData.admins?.includes(auth.currentUser?.uid || '')) {
            Alert.alert(
              'Error',
              'You do not have permission to edit this group',
            );
            navigation.goBack();
          }
        } else {
          setError('Group not found');
        }
      } catch (error) {
        console.error('Error loading group data:', error);
        setError('Failed to load group information');
      } finally {
        setLoading(false);
      }
    };

    loadGroupData();
    dispatch(fetchTreasuryStats(groupId));
  }, [groupId, navigation]);

  // Initialize prudent reserve input once treasury stats are loaded from
  // treasury_overviews — the authoritative source for this value.
  // The ref guard prevents background re-fetches from overwriting user edits.
  useEffect(() => {
    if (treasuryStats !== undefined && !prudentReserveInitialized.current) {
      prudentReserveInitialized.current = true;
      setPrudentReserveInput((treasuryStats.prudentReserve ?? 600).toString());
    }
  }, [treasuryStats]);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate inputs
      if (!name.trim()) {
        Alert.alert('Error', 'Group name is required');
        return;
      }

      // Validate prudent reserve
      const prudentReserveValue = Number(prudentReserveInput);
      if (isNaN(prudentReserveValue) || prudentReserveValue < 0) {
        setPrudentReserveError('Please enter a valid amount (0 or greater)');
        return;
      }
      if (prudentReserveValue > 10000) {
        setPrudentReserveError('Prudent reserve cannot exceed $10,000');
        return;
      }
      setPrudentReserveError('');

      // Update group details
      await GroupModel.update(groupId, {
        name: name.trim(),
        description: description.trim(),
        location: location.address.trim(),
        lat: location.latitude,
        lng: location.longitude,
        placeName: location.placeName,
        isPublic,
        publicDescription: isPublic ? publicDescription.trim() : '',
        publicProfileEnabled,
      });

      dispatch(
        updateGroup({
          groupId,
          groupData: {
            name: name.trim(),
            description: description.trim(),
            location: location.address.trim(),
            lat: location.latitude,
            lng: location.longitude,
            isPublic,
            publicDescription: isPublic ? publicDescription.trim() : '',
            publicProfileEnabled,
          },
        }),
      );

      // Save prudent reserve to treasury_overviews
      await dispatch(
        updatePrudentReserve({groupId, amount: prudentReserveValue}),
      ).unwrap();

      navigation.goBack();
    } catch (error) {
      console.error('Error updating group:', error);
      Alert.alert('Error', 'Failed to update group details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      testID={`group-edit-screen-${groupId}`}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.formContainer}>
          <Text style={styles.label}>Group Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter group name"
            testID="group-edit-name-input"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Enter group description"
            multiline
            testID="group-edit-description-input"
          />

          {/* Public Directory Toggle */}
          <View style={styles.publicDirectorySection}>
            <View style={styles.publicDirectoryHeader}>
              <View style={styles.publicDirectoryLabelGroup}>
                <Text style={styles.label}>List in Public Directory</Text>
                <Text style={styles.helpText}>
                  Allow anyone to discover this group when searching the public
                  directory.
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={value => {
                  if (value) {
                    Alert.alert(
                      'Make Group Public?',
                      'Your group will appear in the public directory and can be discovered by anyone. You can turn this off at any time.',
                      [
                        {text: 'Cancel', style: 'cancel'},
                        {
                          text: 'Make Public',
                          onPress: () => setIsPublic(true),
                        },
                      ],
                    );
                  } else {
                    setIsPublic(false);
                  }
                }}
                trackColor={{false: '#E0E0E0', true: '#BBDEFB'}}
                thumbColor={isPublic ? '#1976D2' : '#BDBDBD'}
                testID="public-directory-toggle"
              />
            </View>
            {isPublic && (
              <>
                <Text style={styles.label}>Public Description</Text>
                <Text style={styles.helpText}>
                  Optional: a short blurb shown in the public directory.
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={publicDescription}
                  onChangeText={setPublicDescription}
                  placeholder="e.g., 'Open AA meeting, all are welcome.'"
                  multiline
                  maxLength={300}
                  testID="group-edit-public-description-input"
                />
              </>
            )}
          </View>

          {/* Public Web Page Toggle */}
          <View style={styles.publicDirectorySection}>
            <View style={styles.publicDirectoryHeader}>
              <View style={styles.publicDirectoryLabelGroup}>
                <Text style={styles.label}>Public Web Page</Text>
                <Text style={styles.helpText}>
                  Show a public page at homegroups-app.com with meeting times so
                  anyone can find and share this group.
                </Text>
              </View>
              <Switch
                value={publicProfileEnabled}
                onValueChange={value => setPublicProfileEnabled(value)}
                trackColor={{false: '#E0E0E0', true: '#BBDEFB'}}
                thumbColor={publicProfileEnabled ? '#1976D2' : '#BDBDBD'}
                testID="group-public-profile-toggle"
              />
            </View>
          </View>

          <Text style={styles.label}>Prudent Reserve Goal</Text>
          <Text style={styles.helpText}>
            Recommended: 2–3 months of expenses. Most groups use $200–$2,000.
          </Text>
          <View style={styles.currencyInputRow}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={[styles.input, styles.currencyInput]}
              value={prudentReserveInput}
              onChangeText={text => {
                setPrudentReserveInput(text);
                setPrudentReserveError('');
              }}
              keyboardType="decimal-pad"
              placeholder="600"
              testID="group-edit-prudent-reserve-input"
            />
          </View>
          {prudentReserveError ? (
            <Text style={styles.errorText}>{prudentReserveError}</Text>
          ) : null}

          <LocationPicker
            initialAddress={location.address}
            initialLocation={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            onLocationSelect={location => {
              setLocation(location);
            }}
          />

          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
            testID="group-edit-save-button"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  timeButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  timeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    marginTop: 20,
  },
  helpText: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 8,
    lineHeight: 18,
  },
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  currencyPrefix: {
    fontSize: 16,
    color: '#333',
    marginRight: 4,
  },
  currencyInput: {
    flex: 1,
    marginBottom: 0,
  },
  publicDirectorySection: {
    marginBottom: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8EEF4',
  },
  publicDirectoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  publicDirectoryLabelGroup: {
    flex: 1,
    marginRight: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#D32F2F',
    marginBottom: 12,
    marginTop: 4,
  },
});

export default GroupEditDetailsScreen;
