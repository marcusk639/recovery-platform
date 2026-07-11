import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {MainStackParamList, Meeting, MeetingType, HomeGroup} from '../../types';
import {Input} from '../../components/common/Input';
import {Button} from '../../components/common/Button';
import DayPicker from '../../components/groups/DayPicker';
import TimePicker from '../../components/groups/TimePicker';
import MeetingTypeSelector from '../../components/groups/MeetingTypeSelector';
import LocationPicker from '../../components/groups/LocationPicker';
import DatePicker from '../../components/common/DatePicker';
import {generateMeetingHash} from '../../utils/hashUtils';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  createGroup,
  selectGroupsStatus,
  selectGroupsError,
} from '../../store/slices/groupsSlice';
import {selectUser} from '../../store/slices/authSlice';
import {streetTypes} from '../../utils/locationUtils';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import {CardForm, useStripe} from '@stripe/stripe-react-native';

// Interface for meeting form data
type MeetingFormData = Meeting;

const CreateGroupScreen: React.FC = () => {
  const navigation =
    useNavigation<StackNavigationProp<GroupStackParamList, 'CreateGroup'>>();
  const route = useRoute<RouteProp<GroupStackParamList, 'CreateGroup'>>();
  const initialMeeting = route.params?.meeting;
  const dispatch = useAppDispatch();

  // Redux state
  const status = useAppSelector(selectGroupsStatus);
  const error = useAppSelector(selectGroupsError);
  const isLoading = status === 'loading';
  const currentUser = useAppSelector(selectUser);

  // Determine if user already admins other groups (multi-group discount applies)
  const adminGroups: string[] =
    currentUser &&
    'adminGroups' in currentUser &&
    Array.isArray((currentUser as any).adminGroups)
      ? (currentUser as any).adminGroups
      : [];
  const isMultiGroupUser = adminGroups.length > 0;

  // Step management
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Group details form state
  const [groupName, setGroupName] = useState<string>(
    initialMeeting ? `${initialMeeting.name} Group` : '',
  );
  const [groupDescription, setGroupDescription] = useState<string>(
    initialMeeting
      ? `A recovery group that meets at ${initialMeeting.name}`
      : '',
  );
  const [foundedDate, setFoundedDate] = useState<string>('');
  const [groupType, setGroupType] = useState<MeetingType>(
    initialMeeting ? initialMeeting.type : 'AA',
  );
  const [showCustomTypeInput, setShowCustomTypeInput] =
    useState<boolean>(false);
  const [customType, setCustomType] = useState<string>('');

  // Meetings state
  const [meetings, setMeetings] = useState<MeetingFormData[]>(
    initialMeeting
      ? [
          {
            id: initialMeeting.id || generateMeetingHash(initialMeeting),
            name: initialMeeting.name,
            day: initialMeeting.day,
            time: initialMeeting.time,
            format: initialMeeting.format || 'Open Discussion',
            online: initialMeeting.online,
            location: initialMeeting.location,
            address: initialMeeting.address || '',
            city: initialMeeting.city || '',
            state: initialMeeting.state || '',
            zip: initialMeeting.zip || '',
            link: initialMeeting.link || '',
            type: initialMeeting.type,
            country: initialMeeting.country || 'USA',
          },
        ]
      : [],
  );

  // Current meeting being edited
  const [currentMeetingIndex, setCurrentMeetingIndex] = useState<number>(0);
  const currentMeeting = meetings[currentMeetingIndex];

  // Form validation errors
  const [errors, setErrors] = useState({
    groupName: '',
    groupDescription: '',
    meetingDay: '',
    meetingTime: '',
    location: '',
    address: '',
    link: '',
    groupType: '',
    groupLocation: '',
  });

  // Add state for group location
  const [useCustomGroupLocation, setUseCustomGroupLocation] =
    useState<boolean>(false);
  const [groupLocation, setGroupLocation] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
    latitude?: number;
    longitude?: number;
    locationName: string;
  }>({
    address: '',
    city: '',
    state: '',
    zip: '',
    locationName: '',
  });

  // Stripe payment state
  const [cardDetails, setCardDetails] = useState<any>(null);
  const {createPaymentMethod} = useStripe();

  // Referral code
  const [referralCodeInput, setReferralCodeInput] = useState<string>('');

  // Show Redux errors
  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
    }
  }, [error]);

  // Validate step 1 (basic info)
  const validateStep1 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};

    if (!groupName.trim()) {
      newErrors.groupName = 'Group name is required';
      isValid = false;
    } else if (groupName.length < 3) {
      newErrors.groupName = 'Group name must be at least 3 characters';
      isValid = false;
    } else {
      newErrors.groupName = '';
    }

    if (!groupDescription.trim()) {
      newErrors.groupDescription = 'Group description is required';
      isValid = false;
    } else {
      newErrors.groupDescription = '';
    }

    if (!groupType.trim()) {
      newErrors.groupType = 'Group type is required';
      isValid = false;
    } else {
      newErrors.groupType = '';
    }

    setErrors(newErrors);
    return isValid;
  };

  // Validate step 2 (meeting details)
  const validateStep2 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};
    const allValidationErrors = [];

    // Check if we have any meetings
    if (meetings.length === 0) {
      Alert.alert('Error', 'Please add at least one meeting.');
      return false;
    }

    if (!currentMeeting) {
      Alert.alert('Error', 'Invalid meeting selection.');
      return false;
    }

    if (!currentMeeting.day) {
      newErrors.meetingDay = 'Meeting day is required';
      allValidationErrors.push('Meeting day is required');
      isValid = false;
    } else {
      newErrors.meetingDay = '';
    }

    if (!currentMeeting.time) {
      newErrors.meetingTime = 'Meeting time is required';
      allValidationErrors.push('Meeting time is required');
      isValid = false;
    } else {
      newErrors.meetingTime = '';
    }

    // Validate meeting location/link
    if (currentMeeting.online) {
      if (!currentMeeting.link?.trim()) {
        newErrors.link = 'Meeting link is required for online meetings';
        allValidationErrors.push(
          'Meeting link is required for online meetings',
        );
        isValid = false;
      } else {
        newErrors.link = '';
      }
    } else {
      if (!currentMeeting.location?.trim()) {
        newErrors.location = 'Location name is required';
        allValidationErrors.push('Location name is required');
        isValid = false;
      } else {
        newErrors.location = '';
      }

      if (!currentMeeting.address?.trim()) {
        newErrors.address = 'Address is required';
        allValidationErrors.push('Address is required');
        isValid = false;
      } else {
        newErrors.address = '';
      }
    }

    setErrors(newErrors);

    // Show all validation errors in one alert if needed
    if (allValidationErrors.length > 0) {
      Alert.alert('Please Fix These Errors', allValidationErrors.join('\n'));
    }

    return isValid;
  };

  // Validate step 3 (location info)
  const validateStep3 = (): boolean => {
    let isValid = true;
    const newErrors = {...errors};

    // Validate group location if using custom location
    if (useCustomGroupLocation) {
      if (!groupLocation.address) {
        newErrors.groupLocation = 'Group address is required';
        Alert.alert('Error', 'Group address is required');
        isValid = false;
      } else if (!groupLocation.locationName) {
        newErrors.groupLocation = 'Group location name is required';
        Alert.alert('Error', 'Group location name is required');
        isValid = false;
      } else {
        newErrors.groupLocation = '';
      }
    } else if (meetings.length === 0) {
      // If we're not using custom location, ensure we have at least one meeting
      Alert.alert(
        'Error',
        'You must add at least one meeting or specify a custom group location',
      );
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  // Validate step 4 (payment details)
  const validateStep4 = (): boolean => {
    if (!cardDetails?.complete) {
      Alert.alert('Payment Required', 'Please enter your payment details.');
      return false;
    }
    return true;
  };

  // Handle navigation between steps
  const nextStep = (): void => {
    if (currentStep === 1 && validateStep1()) {
      // If we're moving to step 2 and don't have any meetings yet,
      // create a default meeting
      if (meetings.length === 0) {
        const defaultMeeting: MeetingFormData = {
          id: '',
          name: groupName,
          day: '',
          time: '',
          format: 'Open Discussion',
          online: false,
          location: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          link: '',
          type: groupType,
        };
        setMeetings([defaultMeeting]);
      }
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    } else if (currentStep === 3 && validateStep3()) {
      setCurrentStep(4); // Move to the new payment step
    } else if (currentStep === 4 && validateStep4()) {
      handleCreateGroup(); // Now create the group and subscription
    }
  };

  const prevStep = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  // Add a new meeting
  const addMeeting = (): void => {
    const baseMeeting = meetings[0] || {
      name: groupName,
      day: '',
      time: '',
      format: 'Open Discussion',
      isOnline: false,
      location: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      onlineLink: '',
      type: 'AA' as MeetingType,
    };

    const meetingId = generateMeetingHash({
      id: baseMeeting.id || '',
      name: groupName,
      type: baseMeeting.type,
      day: baseMeeting.day,
      time: baseMeeting.time,
      location: baseMeeting.location,
      online: baseMeeting.online,
      verified: true,
      addedBy: auth().currentUser?.uid || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const newMeeting: MeetingFormData = {
      id: meetingId,
      name: groupName,
      day: baseMeeting.day,
      time: baseMeeting.time,
      format: baseMeeting.format,
      online: baseMeeting.online,
      location: baseMeeting.location,
      address: baseMeeting.address,
      city: baseMeeting.city,
      state: baseMeeting.state,
      zip: baseMeeting.zip,
      link: baseMeeting.link,
      type: baseMeeting.type,
    };

    setMeetings([...meetings, newMeeting]);
    setCurrentMeetingIndex(meetings.length);
  };

  // Remove a meeting
  const removeMeeting = (index: number): void => {
    if (meetings.length <= 1) {
      Alert.alert('Error', 'You must have at least one meeting');
      return;
    }

    const updatedMeetings = [...meetings];
    updatedMeetings.splice(index, 1);
    setMeetings(updatedMeetings);

    // Adjust current meeting index if needed
    if (currentMeetingIndex >= updatedMeetings.length) {
      setCurrentMeetingIndex(updatedMeetings.length - 1);
    }
  };

  // Update current meeting
  const updateCurrentMeeting = (
    field: keyof MeetingFormData | Partial<MeetingFormData>,
    value?: any,
  ): void => {
    const updatedMeetings = [...meetings];

    if (typeof field === 'object') {
      // Handle case where field is an object of updates
      updatedMeetings[currentMeetingIndex] = {
        ...updatedMeetings[currentMeetingIndex],
        ...field,
      };
    } else {
      // Handle case where field is a single key and value is provided
      updatedMeetings[currentMeetingIndex] = {
        ...updatedMeetings[currentMeetingIndex],
        [field]: value,
      };
    }

    setMeetings(updatedMeetings);
  };

  // Handle group type selection
  const handleGroupTypeSelect = (type: string) => {
    if (type === 'custom') {
      setShowCustomTypeInput(true);
    } else {
      setGroupType(type as MeetingType);
      setShowCustomTypeInput(false);
    }
  };

  // Submit custom type
  const submitCustomType = () => {
    if (customType.trim()) {
      setGroupType(customType.trim() as MeetingType);
      setShowCustomTypeInput(false);
    } else {
      Alert.alert('Error', 'Please enter a custom group type');
    }
  };

  // Create the group using Redux
  const handleCreateGroup = async (): Promise<void> => {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to create a group');
      return;
    }

    // Prepare group data
    const groupData: Partial<HomeGroup> = {
      name: groupName,
      description: groupDescription,
      type: groupType,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberCount: 1,
      admins: [currentUser.uid],
    };

    // Set location data based on mode
    if (useCustomGroupLocation) {
      // Use custom group location if specified
      groupData.location = groupLocation.locationName;
      groupData.address = groupLocation.address;
      groupData.city = groupLocation.city;
      groupData.state = groupLocation.state;
      groupData.zip = groupLocation.zip;
      if (groupLocation.latitude && groupLocation.longitude) {
        groupData.lat = groupLocation.latitude;
        groupData.lng = groupLocation.longitude;
      }
    } else if (meetings.length > 0) {
      // Use first meeting's location if available
      const firstMeeting = meetings[0];
      groupData.location = firstMeeting.location;
      groupData.address = firstMeeting.address;
      groupData.city = firstMeeting.city;
      groupData.state = firstMeeting.state;
      groupData.zip = firstMeeting.zip;
      if (firstMeeting.lat && firstMeeting.lng) {
        groupData.lat = firstMeeting.lat;
        groupData.lng = firstMeeting.lng;
      }
    } else {
      // Should never get here due to validation, but just in case
      Alert.alert(
        'Error',
        'A group must have a location specified or at least one meeting.',
      );
      return;
    }

    // Store meetings in the groupData for the GroupModel to use
    groupData.meetings = meetings;

    // Dispatch the action to create the group
    // Before dispatching, create the Stripe PaymentMethod
    const {paymentMethod, error: paymentMethodError} =
      await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            // Optionally, collect billing details from the user if you have input fields for them
            // For CardForm, it automatically uses the details entered in the form.
            // postalCode: cardDetails.postalCode, // Example if CardForm provides it
          },
        },
      });

    if (paymentMethodError) {
      Alert.alert(
        'Payment Error',
        paymentMethodError.message || 'Failed to create payment method.',
      );
      return;
    }

    if (!paymentMethod) {
      Alert.alert('Payment Error', 'Payment method not created.');
      return;
    }

    if (__DEV__) {
      console.log('Payment method created:', paymentMethod.id);
    }

    dispatch(
      createGroup({
        groupData,
        meetings,
        paymentMethodId: paymentMethod.id, // Pass the created payment method ID
        onSuccess: async group => {
          // If a referral code was provided, apply it after group creation
          if (referralCodeInput.trim()) {
            try {
              const applyCodeFn =
                functions().httpsCallable('applyReferralCode');
              await applyCodeFn({
                code: referralCodeInput.trim().toUpperCase(),
                groupId: group.id!,
              });
            } catch (refErr: any) {
              // Non-fatal: log but don't block navigation
              console.warn('Failed to apply referral code:', refErr?.message);
            }
          }
          navigation.navigate('GroupOverview', {
            groupId: group.id!,
            groupName: group.name,
          });
        },
      }),
    );
  };

  // Component to render progress indicator
  const ProgressIndicator = (): React.ReactElement => (
    <View style={styles.progressContainer}>
      <View style={styles.progressStep}>
        <View
          style={[
            styles.stepCircle,
            currentStep >= 1 ? styles.activeStep : {},
          ]}>
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 1 ? styles.activeStepNumber : {},
            ]}>
            1
          </Text>
        </View>
        <Text
          style={[
            styles.stepLabel,
            currentStep >= 1 ? styles.activeStepLabel : {},
          ]}>
          Group Basics
        </Text>
      </View>
      <View style={styles.progressLine} />
      <View style={styles.progressStep}>
        <View
          style={[
            styles.stepCircle,
            currentStep >= 2 ? styles.activeStep : {},
          ]}>
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 2 ? styles.activeStepNumber : {},
            ]}>
            2
          </Text>
        </View>
        <Text
          style={[
            styles.stepLabel,
            currentStep >= 2 ? styles.activeStepLabel : {},
          ]}>
          Meeting Schedule
        </Text>
      </View>
      <View style={styles.progressLine} />
      <View style={styles.progressStep}>
        <View
          style={[
            styles.stepCircle,
            currentStep >= 3 ? styles.activeStep : {},
          ]}>
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 3 ? styles.activeStepNumber : {},
            ]}>
            3
          </Text>
        </View>
        <Text
          style={[
            styles.stepLabel,
            currentStep >= 3 ? styles.activeStepLabel : {},
          ]}>
          Location
        </Text>
      </View>
      <View style={styles.progressLine} />
      <View style={styles.progressStep}>
        <View
          style={[
            styles.stepCircle,
            currentStep >= 4 ? styles.activeStep : {},
          ]}>
          <Text
            style={[
              styles.stepNumber,
              currentStep >= 4 ? styles.activeStepNumber : {},
            ]}>
            4
          </Text>
        </View>
        <Text
          style={[
            styles.stepLabel,
            currentStep >= 4 ? styles.activeStepLabel : {},
          ]}>
          Payment
        </Text>
      </View>
    </View>
  );

  // Render step 1 (group basics)
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Group Information</Text>
      <Input
        label="Group Name"
        value={groupName}
        onChangeText={setGroupName}
        error={errors.groupName}
        placeholder="Enter group name"
        testID="create-group-name-input"
      />
      <Input
        label="Description"
        value={groupDescription}
        onChangeText={setGroupDescription}
        error={errors.groupDescription}
        placeholder="Enter group description"
        multiline
        numberOfLines={3}
        testID="create-group-description-input"
      />

      {/* Group Type Selector */}
      <View style={styles.groupTypeContainer}>
        <Text style={styles.sectionLabel}>Group Type</Text>
        {errors.groupType ? (
          <Text style={styles.errorText}>{errors.groupType}</Text>
        ) : null}

        <View style={styles.typeButtons}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              groupType === 'AA' &&
                !showCustomTypeInput &&
                styles.selectedTypeButton,
            ]}
            onPress={() => handleGroupTypeSelect('AA')}>
            <Text
              style={[
                styles.typeButtonText,
                groupType === 'AA' &&
                  !showCustomTypeInput &&
                  styles.selectedTypeButtonText,
              ]}>
              Alcoholics Anonymous
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              groupType === 'NA' &&
                !showCustomTypeInput &&
                styles.selectedTypeButton,
            ]}
            onPress={() => handleGroupTypeSelect('NA')}>
            <Text
              style={[
                styles.typeButtonText,
                groupType === 'NA' &&
                  !showCustomTypeInput &&
                  styles.selectedTypeButtonText,
              ]}>
              Narcotics Anonymous
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              groupType === 'Celebrate Recovery' &&
                !showCustomTypeInput &&
                styles.selectedTypeButton,
            ]}
            onPress={() => handleGroupTypeSelect('Celebrate Recovery')}>
            <Text
              style={[
                styles.typeButtonText,
                groupType === 'Celebrate Recovery' &&
                  !showCustomTypeInput &&
                  styles.selectedTypeButtonText,
              ]}>
              Celebrate Recovery
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              showCustomTypeInput && styles.selectedTypeButton,
            ]}
            onPress={() => handleGroupTypeSelect('custom')}>
            <Text
              style={[
                styles.typeButtonText,
                showCustomTypeInput && styles.selectedTypeButtonText,
              ]}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>

        {showCustomTypeInput && (
          <View style={styles.customTypeContainer}>
            <Input
              label="Custom Group Type"
              value={customType}
              onChangeText={setCustomType}
              placeholder="Enter custom group type"
              containerStyle={{width: '75%'}}
            />
            <View style={styles.buttonContainer}>
              <Button
                title="Save"
                onPress={submitCustomType}
                size="small"
                style={styles.customTypeButton}
              />
            </View>
          </View>
        )}

        {groupType && !showCustomTypeInput && (
          <View style={styles.selectedTypeDisplay}>
            <Text style={styles.selectedTypeText}>Selected: {groupType}</Text>
          </View>
        )}
      </View>

      <DatePicker
        visible={false}
        onClose={() => {}}
        onSelect={date => setFoundedDate(date?.toISOString() || '')}
        initialDate={foundedDate ? new Date(foundedDate) : undefined}
      />
    </View>
  );

  // Render step 2 (meeting schedule)
  const renderStep2 = () => {
    // Make sure we have a valid meeting index
    if (meetings.length === 0) {
      return (
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>Meeting Schedule</Text>
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No meetings added yet.</Text>
            <Button
              title="Add First Meeting"
              onPress={addMeeting}
              style={styles.emptyStateButton}
            />
          </View>
        </View>
      );
    }

    const currentMeeting = meetings[currentMeetingIndex];

    // Safety check - shouldn't happen with the above code, but just to be sure
    if (!currentMeeting) {
      setCurrentMeetingIndex(0);
      return null;
    }

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Meeting Schedule</Text>

        {/* Meeting selector */}
        <View style={styles.meetingSelector}>
          <Text style={styles.meetingSelectorLabel}>Meetings:</Text>
          <View style={styles.meetingTabsContainer}>
            {meetings.map((item, index) => (
              <TouchableOpacity
                key={`meeting-${index}`}
                style={[
                  styles.meetingTab,
                  currentMeetingIndex === index && styles.activeMeetingTab,
                ]}
                onPress={() => setCurrentMeetingIndex(index)}>
                <Text
                  style={[
                    styles.meetingTabText,
                    currentMeetingIndex === index &&
                      styles.activeMeetingTabText,
                  ]}>
                  Meeting {index + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.addMeetingButton}
            onPress={addMeeting}>
            <Text style={styles.addMeetingButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Meeting details */}
        <View style={styles.meetingDetails}>
          <View style={styles.meetingHeader}>
            <Text style={styles.meetingTitle}>
              Meeting {currentMeetingIndex + 1}
            </Text>
            {meetings.length > 1 && (
              <TouchableOpacity
                style={styles.removeMeetingButton}
                onPress={() => removeMeeting(currentMeetingIndex)}>
                <Text style={styles.removeMeetingButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Meeting Basic Info */}
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Basic Info</Text>

            <Input
              label="Meeting Name"
              value={currentMeeting.name}
              onChangeText={value => updateCurrentMeeting('name', value)}
              placeholder="Enter meeting name"
              testID="create-group-meeting-name-input"
            />

            <DayPicker
              selectedDay={currentMeeting.day}
              onSelectDay={value => updateCurrentMeeting('day', value)}
            />

            <TimePicker
              selectedTime={currentMeeting.time}
              onSelectTime={value => updateCurrentMeeting('time', value)}
            />

            <Input
              label="Format"
              value={currentMeeting.format}
              onChangeText={value => updateCurrentMeeting('format', value)}
              placeholder="Enter meeting format"
            />
          </View>

          {/* Meeting Location */}
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Meeting Location</Text>

            <View style={styles.onlineToggle}>
              <Text style={styles.onlineToggleLabel}>Online Meeting</Text>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  currentMeeting.online ? styles.toggleButtonActive : {},
                ]}
                onPress={() =>
                  updateCurrentMeeting('online', !currentMeeting.online)
                }>
                <Text
                  style={[
                    styles.toggleButtonText,
                    currentMeeting.online ? styles.toggleButtonTextActive : {},
                  ]}>
                  {currentMeeting.online ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            </View>

            {currentMeeting.online ? (
              <Input
                label="Online Meeting Link"
                value={currentMeeting.link || ''}
                onChangeText={value => updateCurrentMeeting('link', value)}
                error={errors.link}
                placeholder="Enter online meeting link"
              />
            ) : (
              <>
                <Input
                  label="Location Name"
                  value={currentMeeting.location}
                  onChangeText={value =>
                    updateCurrentMeeting('location', value)
                  }
                  error={errors.location}
                  placeholder="Enter location name"
                  testID="create-group-location-input"
                />

                <LocationPicker
                  label="Address"
                  initialAddress={getMeetingAddress(currentMeeting) || ''}
                  initialLocation={
                    currentMeeting.lat && currentMeeting.lng
                      ? {
                          latitude: currentMeeting.lat,
                          longitude: currentMeeting.lng,
                        }
                      : undefined
                  }
                  onLocationSelect={location => {
                    // Prepare updates object with initial values
                    const locationUpdates: Partial<MeetingFormData> = {
                      address: location.address || '',
                    };

                    // Add coordinates if they exist
                    if (location.latitude)
                      locationUpdates.lat = location.latitude;
                    if (location.longitude)
                      locationUpdates.lng = location.longitude;

                    // Add location name if not already set and available
                    if (location.placeName && !currentMeeting.location) {
                      locationUpdates.location = location.placeName;
                    }

                    // Add country if not already set and available
                    if (location.country && !currentMeeting.country) {
                      locationUpdates.country = location.country;
                    }

                    // Check if we need to parse components from the address string
                    if (
                      location.address &&
                      (!location.city || !location.state || !location.zip)
                    ) {
                      // Parse the address string: "123 Main St, City, State Zip, Country"
                      const addressParts = location.address
                        .split(',')
                        .map(part => part.trim());

                      const firstPart = addressParts[0];
                      // check if the first part is a street property
                      if (
                        streetTypes.some(type =>
                          firstPart.toLowerCase().includes(type),
                        )
                      ) {
                        // The first part is likely the street address
                        locationUpdates.street = firstPart;
                      } else {
                        // The first part is likely the city
                        locationUpdates.city = firstPart;
                      }

                      // Try to parse city, state, and zip from the remaining parts
                      if (addressParts.length > 1) {
                        // If city isn't provided directly, it's likely the second component
                        if (!location.city && addressParts.length > 1) {
                          locationUpdates.city = addressParts[1] || '';
                        } else if (location.city) {
                          locationUpdates.city = location.city;
                        }

                        // If state/zip isn't provided directly, try to parse from the third component
                        if (
                          (!location.state || !location.zip) &&
                          addressParts.length > 2
                        ) {
                          const stateZipPart = addressParts[2] || '';
                          const stateZipMatch = stateZipPart.match(
                            /([A-Z]{2})\s*(\d{5})?/,
                          );

                          if (stateZipMatch) {
                            // Extract state if found and not already set
                            if (!location.state && stateZipMatch[1]) {
                              locationUpdates.state = stateZipMatch[1];
                            }

                            // Extract zip if found and not already set
                            if (!location.zip && stateZipMatch[2]) {
                              locationUpdates.zip = stateZipMatch[2];
                            }
                          } else {
                            // If no match, use the whole part as state if not set
                            if (!location.state) {
                              locationUpdates.state =
                                stateZipPart.split(' ')[0] || '';
                            }
                          }
                        } else {
                          // Use provided values if available
                          if (location.state)
                            locationUpdates.state = location.state;
                          if (location.zip) locationUpdates.zip = location.zip;
                        }
                      }
                    } else {
                      // Use provided values if available
                      if (location.city) locationUpdates.city = location.city;
                      if (location.state)
                        locationUpdates.state = location.state;
                      if (location.zip) locationUpdates.zip = location.zip;
                    }

                    // Apply all updates at once
                    updateCurrentMeeting(locationUpdates);

                    // Double check address is set properly after all the updates
                    setTimeout(() => {
                      const updatedMeeting = meetings[currentMeetingIndex];
                      console.log(
                        'Final meeting after location updates:',
                        updatedMeeting,
                      );

                      // If address is still empty but we have street, set address = street as fallback
                      if (!updatedMeeting.address && updatedMeeting.street) {
                        console.log('Setting address from street as fallback');
                        updateCurrentMeeting('address', updatedMeeting.street);
                      }
                    }, 200);
                  }}
                />
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  const getMeetingAddress = (meeting: Meeting) => {
    if (meeting.online) {
      return meeting.link;
    }
    return meeting.address;
  };

  // Render step 3 (location)
  const renderStep3 = () => {
    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Group Location</Text>

        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>Set specific group location</Text>
          <Switch
            value={useCustomGroupLocation}
            onValueChange={setUseCustomGroupLocation}
            trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
            thumbColor={useCustomGroupLocation ? '#2196F3' : '#FFFFFF'}
          />
        </View>

        <Text style={styles.helperText}>
          {useCustomGroupLocation
            ? 'Specify a location for the group'
            : 'If not specified, the location of the first meeting will be used as the group location'}
        </Text>

        {useCustomGroupLocation && (
          <>
            {errors.groupLocation ? (
              <Text style={styles.errorText}>{errors.groupLocation}</Text>
            ) : null}

            <Input
              label="Location Name"
              value={groupLocation.locationName}
              onChangeText={text =>
                setGroupLocation({...groupLocation, locationName: text})
              }
              placeholder="Enter location name"
            />

            <LocationPicker
              label="Group Address"
              initialAddress={
                groupLocation.address
                  ? `${groupLocation.address}, ${groupLocation.city}, ${groupLocation.state} ${groupLocation.zip}`
                  : ''
              }
              onLocationSelect={location => {
                setGroupLocation({
                  ...groupLocation,
                  address: location.address || '',
                  city: location.city || '',
                  state: location.state || '',
                  zip: location.zip || '',
                  latitude: location.latitude,
                  longitude: location.longitude,
                  locationName:
                    location.placeName || groupLocation.locationName,
                });
              }}
            />
          </>
        )}

        <View style={styles.stepDescription}>
          <Text style={styles.stepDescriptionText}>
            This will be the central location for your group and will be used
            for member searches and group discovery.
          </Text>
        </View>

        {/* Referral Code */}
        <View style={styles.referralSection}>
          <Text style={styles.referralLabel}>Referral Code (optional)</Text>
          <Text style={styles.referralHelper}>
            Have a referral code from another group admin? Enter it here.
          </Text>
          <Input
            label=""
            value={referralCodeInput}
            onChangeText={text => setReferralCodeInput(text.toUpperCase())}
            placeholder="e.g. JOHN2024"
            autoCapitalize="characters"
          />
        </View>
      </View>
    );
  };

  // Render step 4 (payment)
  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Payment Information</Text>
      {isMultiGroupUser ? (
        <>
          <Text style={styles.paymentDescription}>
            Multi-group discount applied! As an existing group admin, your
            additional group is just{' '}
            <Text style={styles.discountPriceText}>$8/year</Text> instead of
            $12/year.
          </Text>
          <Text style={styles.paymentDescription}>
            Your first 90 days are free. A payment method is needed to activate
            after the trial.
          </Text>
        </>
      ) : (
        <Text style={styles.paymentDescription}>
          A subscription is required to create a new group. Your first 7 days
          are free, but payment information is needed to activate the
          subscription.
        </Text>
      )}
      <CardForm
        onFormComplete={setCardDetails}
        style={styles.cardForm}
        cardStyle={styles.cardFormStyle}
        testID="create-group-card-form"
      />
    </View>
  );

  // Render the current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}>
          <ProgressIndicator />

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}>
            {renderStepContent()}
          </ScrollView>

          <View
            style={{
              ...styles.footer,
              flexDirection: 'row',
              justifyContent: 'space-evenly',
              alignItems: 'center',
            }}>
            {currentStep > 1 && (
              <Button
                style={{height: 50, width: '48%'}}
                size="medium"
                fullWidth={false}
                title="Back"
                onPress={prevStep}
                variant="secondary"
                disabled={isLoading}
                testID="create-group-back-button"
              />
            )}
            <Button
              style={{height: 50, width: '48%'}}
              title={currentStep === 4 ? 'Create Group' : 'Next'} // Update button title
              onPress={nextStep}
              disabled={
                isLoading || (currentStep === 4 && !cardDetails?.complete)
              } // Disable if card details incomplete on step 4
              size="medium"
              fullWidth={false}
              testID="create-group-next-button"
            />
          </View>

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: '#2196F3',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  progressStep: {
    alignItems: 'center',
  },
  progressLine: {
    height: 2,
    width: 40,
    backgroundColor: '#E0E0E0',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  activeStep: {
    backgroundColor: '#2196F3',
  },
  stepNumber: {
    fontSize: 16,
    color: '#757575',
  },
  activeStepNumber: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 12,
    color: '#757575',
  },
  activeStepLabel: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    flexGrow: 1,
  },
  stepContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  onlineToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  onlineToggleLabel: {
    fontSize: 16,
    color: '#212121',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
  },
  toggleButtonActive: {
    backgroundColor: '#2196F3',
  },
  toggleButtonText: {
    color: '#757575',
  },
  toggleButtonTextActive: {
    color: '#FFFFFF',
  },
  meetingSelector: {
    marginBottom: 16,
  },
  meetingSelectorLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  meetingTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  activeMeetingTab: {
    backgroundColor: '#2196F3',
  },
  meetingTabText: {
    color: '#757575',
  },
  activeMeetingTabText: {
    color: '#FFFFFF',
  },
  addMeetingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  addMeetingButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  meetingDetails: {
    marginTop: 16,
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  removeMeetingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
  },
  removeMeetingButtonText: {
    color: '#F44336',
    fontSize: 12,
  },
  groupTypeContainer: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  selectedTypeButton: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    color: '#757575',
    fontSize: 14,
  },
  selectedTypeButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  customTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    justifyContent: 'space-between',
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 0,
    marginTop: 5,
  },
  customTypeButton: {
    minHeight: 44,
    width: '80%',
  },
  selectedTypeDisplay: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  selectedTypeText: {
    color: '#1976D2',
    fontWeight: 'bold',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 8,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyStateButton: {
    minWidth: 200,
  },
  groupLocationContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: '#424242',
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  formSection: {
    marginBottom: 20,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingBottom: 6,
  },
  stepDescription: {
    marginTop: 20,
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 8,
  },
  stepDescriptionText: {
    fontSize: 14,
    color: '#0277BD',
    lineHeight: 20,
  },
  referralSection: {
    marginTop: 20,
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  referralLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 4,
  },
  referralHelper: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 8,
    lineHeight: 18,
  },
  meetingTabsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  paymentDescription: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
    textAlign: 'center',
  },
  discountPriceText: {
    fontWeight: '700',
    color: '#4CAF50',
  },
  cardForm: {
    height: 200, // Adjust height as needed
    marginBottom: 16,
  },
  cardFormStyle: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    textColor: '#212121',
  },
});

export default CreateGroupScreen;
