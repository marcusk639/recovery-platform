// mobile/src/screens/profile/StepTrackerScreen.tsx
import React, {useState, useEffect, useCallback, useLayoutEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadStepProgress,
  loadStepNotes,
  updateCurrentStep,
  completeStep,
  saveStepNote,
  selectCurrentStep,
  selectCompletedSteps,
  selectStepProgress,
  selectStepWorkLoading,
  selectStepNote,
} from '../../store/slices/stepWorkSlice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_STATEMENTS = [
  'We admitted we were powerless over our addiction — that our lives had become unmanageable.',
  'Came to believe that a Power greater than ourselves could restore us to sanity.',
  'Made a decision to turn our will and our lives over to the care of God as we understood God.',
  'Made a searching and fearless moral inventory of ourselves.',
  'Admitted to God, to ourselves, and to another human being the exact nature of our wrongs.',
  'Were entirely ready to have God remove all these defects of character.',
  'Humbly asked God to remove our shortcomings.',
  'Made a list of all persons we had harmed, and became willing to make amends to them all.',
  'Made direct amends to such people wherever possible, except when to do so would injure them or others.',
  'Continued to take personal inventory and when we were wrong promptly admitted it.',
  'Sought through prayer and meditation to improve our conscious contact with God as we understood God, praying only for knowledge of God\'s will for us and the power to carry that out.',
  'Having had a spiritual awakening as the result of these steps, we tried to carry this message to addicts, and to practice these principles in all our affairs.',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const StepTrackerScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  // Support sponsor read-only view: if userId param is provided, it's a sponsee view.
  // Works for both ProfileStackParamList (StepTracker) and GroupStackParamList (SponseeStepProgress).
  const params = (route.params ?? {}) as {userId?: string; sponseeName?: string};
  const viewUserId = params.userId;
  const sponseeName = params.sponseeName;
  const isReadOnly = !!viewUserId;

  const currentUser = auth().currentUser;
  const targetUserId = viewUserId ?? currentUser?.uid;

  // Redux state
  const currentStep = useAppSelector(selectCurrentStep);
  const completedSteps = useAppSelector(selectCompletedSteps);
  const progress = useAppSelector(selectStepProgress);
  const loading = useAppSelector(selectStepWorkLoading);

  // Local state
  const [noteContent, setNoteContent] = useState('');
  const [isNotePrivate, setIsNotePrivate] = useState(true);
  const [allowSponsorAccess, setAllowSponsorAccess] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [completingStep, setCompletingStep] = useState(false);
  const [previousStepsExpanded, setPreviousStepsExpanded] = useState(false);

  // Current step note from store
  const currentStepNote = useAppSelector(selectStepNote(currentStep));

  // Set navigation title for sponsor view
  useLayoutEffect(() => {
    if (isReadOnly && sponseeName) {
      navigation.setOptions({title: `${sponseeName}'s Step Work`});
    }
  }, [navigation, isReadOnly, sponseeName]);

  // Load data on mount
  useEffect(() => {
    if (targetUserId) {
      dispatch(loadStepProgress(targetUserId));
      dispatch(loadStepNotes(targetUserId));
    }
  }, [dispatch, targetUserId]);

  // Sync local note content with store
  useEffect(() => {
    if (currentStepNote) {
      setNoteContent(currentStepNote.content);
      setIsNotePrivate(currentStepNote.isPrivate);
    } else {
      setNoteContent('');
      setIsNotePrivate(true);
    }
  }, [currentStepNote]);

  // Sync sponsor access toggle with progress
  useEffect(() => {
    if (progress) {
      setAllowSponsorAccess(progress.allowSponsorAccess);
    }
  }, [progress]);

  const handleSaveNote = useCallback(() => {
    if (isReadOnly) {return;}
    dispatch(
      saveStepNote({
        step: currentStep,
        content: noteContent,
        isPrivate: isNotePrivate,
      }),
    );
  }, [dispatch, currentStep, noteContent, isNotePrivate, isReadOnly]);

  const handleCompleteStep = async () => {
    if (isReadOnly) {return;}
    Alert.alert(
      `Complete Step ${currentStep}?`,
      'This will mark this step as complete and move you to the next step.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Complete',
          style: 'default',
          onPress: async () => {
            setCompletingStep(true);
            try {
              await dispatch(
                completeStep({
                  step: currentStep,
                  startedAt: progress?.startedAt ?? null,
                }),
              ).unwrap();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to complete step.');
            } finally {
              setCompletingStep(false);
            }
          },
        },
      ],
    );
  };

  const handleToggleSponsorAccess = async (value: boolean) => {
    if (isReadOnly) {return;}

    // Require a progress document to exist
    if (!progress) {
      Alert.alert(
        'No Step Progress',
        'Start your step work before sharing with a sponsor.',
      );
      return;
    }

    const sponsorId = progress.sponsorId;
    if (!sponsorId && value) {
      Alert.alert(
        'No Sponsor',
        'You must set a sponsor before sharing step progress. Set your sponsor through the sponsorship section.',
      );
      return;
    }

    setTogglingAccess(true);
    try {
      const fn = functions().httpsCallable('grantSponsorStepAccess');
      await fn({sponsorId: sponsorId ?? '', allow: value});
      setAllowSponsorAccess(value);
      // Reload to sync
      dispatch(loadStepProgress(undefined));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update sponsor access.');
    } finally {
      setTogglingAccess(false);
    }
  };

  const handleStartStepWork = async () => {
    if (isReadOnly) {return;}
    try {
      await dispatch(updateCurrentStep(1)).unwrap();
      dispatch(loadStepProgress(undefined));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start step work.');
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderProgressBar = () => {
    return (
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          {Array.from({length: 12}, (_, i) => {
            const stepNum = i + 1;
            const isCompleted = completedSteps.some(s => s.step === stepNum);
            const isCurrent = stepNum === currentStep;
            return (
              <View
                key={stepNum}
                style={[
                  styles.progressDot,
                  isCompleted && styles.progressDotCompleted,
                  isCurrent && !isCompleted && styles.progressDotCurrent,
                ]}>
                {(isCompleted || isCurrent) && (
                  <Text style={styles.progressDotText}>
                    {isCompleted ? '✓' : String(stepNum)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        <Text style={styles.progressLabel}>
          {completedSteps.length} of 12 steps completed
        </Text>
      </View>
    );
  };

  const formatTimestamp = (ts: any): string => {
    if (!ts) {return 'Unknown date';}
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / empty states
  // ---------------------------------------------------------------------------

  if (loading && !progress) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading step progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!progress) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.centeredContent}>
          <Icon name="book-outline" size={64} color="#BDBDBD" />
          <Text style={styles.emptyTitle}>Step Work</Text>
          <Text style={styles.emptySubtitle}>
            Track your journey through the 12 steps. Your progress and notes are
            private by default.
          </Text>
          {!isReadOnly && (
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartStepWork}>
              <Text style={styles.startButtonText}>Begin Step Work</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const stepStatement = STEP_STATEMENTS[currentStep - 1] ?? '';
  const isLastStep = currentStep === 12;
  const isCurrentStepCompleted = completedSteps.some(
    s => s.step === currentStep,
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Progress Bar */}
        {renderProgressBar()}

        {/* Current Step Card */}
        <View style={styles.card}>
          <Text style={styles.stepLabel}>
            {isCurrentStepCompleted && !isLastStep
              ? `Step ${currentStep} — Completed`
              : `Step ${currentStep}`}
          </Text>
          <Text style={styles.stepStatement}>
            <Text style={styles.stepNumber}>{currentStep}. </Text>
            {stepStatement}
          </Text>

          {progress.startedAt && (
            <Text style={styles.startedAt}>
              Started: {formatTimestamp(progress.startedAt)}
            </Text>
          )}

          {!isReadOnly && !isCurrentStepCompleted && (
            <TouchableOpacity
              style={[
                styles.completeButton,
                completingStep && styles.buttonDisabled,
              ]}
              onPress={handleCompleteStep}
              disabled={completingStep}>
              {completingStep ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.completeButtonText}>
                  {isLastStep ? 'Complete the Steps' : `Mark Step ${currentStep} Complete`}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {isCurrentStepCompleted && (
            <View style={styles.completedBadge}>
              <Icon name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.completedBadgeText}>Step Completed</Text>
            </View>
          )}
        </View>

        {/* Notes Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>My Notes</Text>

          {isReadOnly ? (
            <Text style={styles.readOnlyNote}>
              {currentStepNote?.content || 'No notes for this step.'}
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.noteInput}
                multiline
                numberOfLines={6}
                value={noteContent}
                onChangeText={setNoteContent}
                onBlur={handleSaveNote}
                placeholder="Write your thoughts, reflections, or work for this step..."
                placeholderTextColor="#9E9E9E"
                textAlignVertical="top"
              />
              <View style={styles.privacyRow}>
                <Icon
                  name={isNotePrivate ? 'lock-closed-outline' : 'earth-outline'}
                  size={16}
                  color="#757575"
                />
                <Text style={styles.privacyText}>
                  {isNotePrivate
                    ? 'Private — only you (and sponsor if shared) can see this'
                    : 'Shared with sponsor'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Sponsor Sharing Toggle — only for own view */}
        {!isReadOnly && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Sponsor Sharing</Text>
            {progress.sponsorId ? (
              <View style={styles.sponsorRow}>
                <View style={styles.sponsorRowText}>
                  <Text style={styles.settingLabel}>Share with your sponsor</Text>
                  <Text style={styles.settingDescription}>
                    Your sponsor will be able to view your step progress and notes.
                  </Text>
                </View>
                {togglingAccess ? (
                  <ActivityIndicator size="small" color="#2196F3" />
                ) : (
                  <Switch
                    value={allowSponsorAccess}
                    onValueChange={handleToggleSponsorAccess}
                    trackColor={{false: '#E0E0E0', true: '#90CAF9'}}
                    thumbColor={allowSponsorAccess ? '#2196F3' : '#FFFFFF'}
                  />
                )}
              </View>
            ) : (
              <Text style={styles.settingDescription}>
                Set a sponsor through the Sponsorship section to enable sharing.
              </Text>
            )}
          </View>
        )}

        {/* Previous Steps (collapsible) */}
        {completedSteps.length > 0 && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.sectionHeaderRow}
              onPress={() => setPreviousStepsExpanded(prev => !prev)}>
              <Text style={styles.sectionTitle}>
                Previous Steps ({completedSteps.length})
              </Text>
              <Icon
                name={
                  previousStepsExpanded
                    ? 'chevron-up-outline'
                    : 'chevron-down-outline'
                }
                size={20}
                color="#757575"
              />
            </TouchableOpacity>

            {previousStepsExpanded &&
              [...completedSteps]
                .sort((a, b) => a.step - b.step)
                .map(cs => (
                  <View key={cs.step} style={styles.completedStepRow}>
                    <View style={styles.completedStepIcon}>
                      <Icon
                        name="checkmark-circle"
                        size={20}
                        color="#4CAF50"
                      />
                    </View>
                    <View style={styles.completedStepInfo}>
                      <Text style={styles.completedStepLabel}>
                        Step {cs.step}
                      </Text>
                      <Text style={styles.completedStepDate}>
                        Completed {formatTimestamp(cs.completedAt)} •{' '}
                        {cs.durationDays}{' '}
                        {cs.durationDays === 1 ? 'day' : 'days'}
                      </Text>
                    </View>
                  </View>
                ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#757575',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  startButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  // Progress bar
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotCompleted: {
    backgroundColor: '#4CAF50',
  },
  progressDotCurrent: {
    backgroundColor: '#2196F3',
  },
  progressDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
  },
  // Cards
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  stepNumber: {
    fontWeight: '700',
    color: '#212121',
  },
  stepStatement: {
    fontSize: 16,
    color: '#212121',
    lineHeight: 24,
    marginBottom: 12,
  },
  startedAt: {
    fontSize: 13,
    color: '#9E9E9E',
    marginBottom: 16,
  },
  completeButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  completedBadgeText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  // Notes
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#FAFAFA',
    minHeight: 120,
    marginBottom: 8,
  },
  readOnlyNote: {
    fontSize: 15,
    color: '#212121',
    lineHeight: 22,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  privacyText: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 6,
    flex: 1,
  },
  // Sponsor
  sponsorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sponsorRowText: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
  // Previous steps
  completedStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  completedStepIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  completedStepInfo: {
    flex: 1,
  },
  completedStepLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  completedStepDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
});

export default StepTrackerScreen;
