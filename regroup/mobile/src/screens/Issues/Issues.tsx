import React, { useState, useCallback, useEffect, Fragment } from 'react';
import { Guests, Admins } from '../../types';
import { House } from '../../entities/House';
import {
  ListRenderItemInfo,
  View,
  Alert,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { HouseIssue, IssueStatus, getIssueStatus } from '../../entities/Issue';
import { CardItem, ActivityItem } from '../../components/card-list/card-list';
import {
  camelCaseToDisplayForm,
  getTodaysDate,
  getDateAndTime,
  getCurrentTime,
} from '../../util/display';
import { color, normalize, CARD_STYLE } from '../../styles/theme';
import { RatsFlatList } from '../../components/rats-flat-list';
import { User } from '../../entities/User';
import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
// Phase 3.3: Migrated from 3 HOC layers to Context hooks
// Removed: withFormModal, withNotifier, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../context';
import { Formik } from 'formik';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsSearchBar from '../../components/rats-search-bar';
import { IssueFilterFormValues, IssueFilterForm } from './IssueFilterForm';
import { AuthConsumer } from '../../context/auth';
import { isAdmin } from '../../util/roles';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests } from '../../state/queries/guestQueries';
import {
  removeIssue as removeIssueService,
  updateIssueStatus as updateIssueStatusService,
} from '../../services/issues';
import { useQueryClient } from '@tanstack/react-query';
import { houseKeys } from '../../state/queries/houseQueries';
import { logException } from '../../util/logging';
import { getSortedIssues } from '../../util/issues';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const ISSUE_MAP = {
  maintenance: {
    icon: 'wrench',
    color: color.dark_blue,
  },
  house: {
    icon: 'house-damage',
    color: color.orange,
  },
  guest: {
    icon: 'user-shield',
    color: color.purple,
  },
};

/**
 * Visual config for each IssueStatus. Controls the left-border accent colour
 * on the card, the icon and background shown in the status badge row, and the
 * label text.
 */
const STATUS_CONFIG: Record<
  IssueStatus,
  { borderColor: string; iconName: string; iconBg: string; label: string }
> = {
  [IssueStatus.OPEN]: {
    borderColor: color.red,
    iconName: 'exclamation-circle',
    iconBg: color.red,
    label: 'Open',
  },
  [IssueStatus.IN_PROGRESS]: {
    borderColor: color.yellow,
    iconName: 'spinner',
    iconBg: color.yellow,
    label: 'In Progress',
  },
  [IssueStatus.RESOLVED]: {
    borderColor: color.green,
    iconName: 'check',
    iconBg: color.green,
    label: 'Resolved',
  },
  [IssueStatus.DISMISSED]: {
    borderColor: color.grey,
    iconName: 'ban',
    iconBg: color.grey,
    label: 'Dismissed',
  },
};

/**
 * Issues Screen
 *
 * Displays and manages house issues. Admins can resolve and remove issues.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 'as any' casts)
 *
 * @migrated Phase 3.3 - Replaced HOCs with Context hooks
 * Changes:
 * - Removed 3 HOC layers (withFormModal, withNotifier, withPopover)
 * - Added useModal and useNotification hooks
 *
 * @updated - IssueStatus system
 * Changes:
 * - Uses getIssueStatus() instead of reading issue.resolution / issue.invalid directly
 * - Uses getSortedIssues() so OPEN issues always appear first
 * - Status-based visual differentiation (coloured left border + badge row)
 * - Resolve / Dismiss wired to updateIssueStatus service thunk
 * - Status filter added to the existing filter form
 */
const IssueScreen: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 3 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { notify, showPopover, setPopoverRef } = useNotification();

  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  // RTK Typed Selectors (no more 'as any')
  const { guest } = useSelectedGuest();
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const user = useAppSelector(state => state.user.user);
  const admins = useAppSelector(state => state.admin.houseAdmins);

  // After each issue write, invalidate houseKeys.detail so the screen
  // (which reads house.issues via useSelectedHouse) reflects the change.
  const invalidateHouse = useCallback(() => {
    if (house?.id) {
      queryClient.invalidateQueries({ queryKey: houseKeys.detail(house.id) });
    }
  }, [house?.id, queryClient]);

  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTermState] = useState('');
  const [filters, setFilters] = useState<IssueFilterFormValues>(
    new IssueFilterFormValues(),
  );

  // ─── Optimistic state for issue statuses ─────────────────────────────────
  // Maps issueId → IssueStatus. Applied on top of the server state while the
  // network call is in flight so the UI feels instant.
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, IssueStatus>
  >({});

  const getEffectiveStatus = useCallback(
    (issue: HouseIssue): IssueStatus => {
      return optimisticStatuses[issue.id] ?? getIssueStatus(issue);
    },
    [optimisticStatuses],
  );

  // ─── Remove Issue ─────────────────────────────────────────────────────────
  const handleRemoveIssue = useCallback(
    (issue: HouseIssue) => () => {
      if (!house) return;

      return Alert.alert(
        'Confirm Removal',
        'Are you sure you want to remove this issue?',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: async () => {
              try {
                await removeIssueService(house, issue);
                invalidateHouse();
                notify(
                  'Issue Removed',
                  'Issue was successfully removed',
                  [],
                  'succeed',
                );
              } catch (err) {
                logException(err);
                notify('Removal Failed', 'Failed to remove issue', [], 'fail');
              }
            },
          },
        ],
      );
    },
    [house, notify, invalidateHouse],
  );

  // ─── Resolve Issue ────────────────────────────────────────────────────────
  /**
   * Opens a modal that lets the admin enter optional resolution text.
   * Optimistically marks the issue as RESOLVED immediately, then
   * dispatches the async thunk.
   */
  const handleResolveIssue = useCallback(
    (issue: HouseIssue) => () => {
      if (!house) return;

      const issueUser = guests?.[issue.issuer] || admins?.[issue.issuer];
      if (!issueUser) return;

      const resolutionForm = (
        <RatsScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flex: 1, width: '100%' }}>
            <CardItem
              container={{ marginBottom: 1 }}
              headerSubtext={getDateAndTime(
                issue.createdAt ?? issue.createdDate,
              )}
              avatarName={issueUser.firstName + ' ' + issueUser.lastName}
              avatarUri={issueUser.avatar}
              activityItems={
                <ActivityItem
                  container={{ marginBottom: normalize(10) }}
                  boxedIconName={ISSUE_MAP[issue.type].icon}
                  boxedIconBackground={ISSUE_MAP[issue.type].color}
                  description={issue.description}
                  descriptionHeader={camelCaseToDisplayForm(issue.type)}
                />
              }
            />
            <Formik
              initialValues={{ resolution: '', id: issue.id }}
              onSubmit={async values => {
                dismissFormModal();
                setError(null);

                // Optimistic update
                setOptimisticStatuses(prev => ({
                  ...prev,
                  [issue.id]: IssueStatus.RESOLVED,
                }));

                try {
                  await updateIssueStatusService(
                    house,
                    issue.id,
                    IssueStatus.RESOLVED,
                    values.resolution || undefined,
                  );
                  invalidateHouse();

                  // Clear optimistic override — server state is now canonical
                  setOptimisticStatuses(prev => {
                    const next = { ...prev };
                    delete next[issue.id];
                    return next;
                  });

                  notify(
                    'Issue Resolved',
                    'Issue was successfully resolved',
                    [],
                    'succeed',
                  );
                } catch (err) {
                  logException(err);
                  // Roll back optimistic update on failure
                  setOptimisticStatuses(prev => {
                    const next = { ...prev };
                    delete next[issue.id];
                    return next;
                  });
                  notify(
                    'Resolution Failed',
                    'Failed to resolve issue',
                    [],
                    'fail',
                  );
                  setError('Something went wrong');
                }
              }}>
              {({ handleSubmit }) => (
                <View style={{ flex: 1 }}>
                  <View style={[CARD_STYLE, { marginBottom: 2 }]}>
                    {renderField(
                      'resolution',
                      'Enter resolution (optional)...',
                      RatsTextInput,
                      false,
                      'Issue Resolution',
                      'string',
                      undefined,
                      undefined,
                      undefined,
                      undefined,
                      undefined,
                      8,
                    )}
                  </View>
                  <ConfirmationButtons
                    container={{
                      ...CARD_STYLE,
                      marginTop: 'auto',
                      marginBottom: 0,
                    }}
                    confirm={handleSubmit}
                    cancel={dismissFormModal}
                  />
                </View>
              )}
            </Formik>
          </View>
        </RatsScrollView>
      );

      showFormModal(resolutionForm, 'Resolve Issue', true);
    },
    [
      house,
      guests,
      admins,
      dismissFormModal,
      notify,
      showFormModal,
      invalidateHouse,
    ],
  );

  // ─── Dismiss Issue ────────────────────────────────────────────────────────
  /**
   * Confirms via Alert, then optimistically marks DISMISSED and fires the thunk.
   */
  const handleDismissIssue = useCallback(
    (issue: HouseIssue) => () => {
      if (!house) return;

      Alert.alert(
        'Dismiss Issue',
        'Mark this issue as dismissed (invalid)? This cannot be undone without admin action.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Dismiss',
            style: 'destructive',
            onPress: async () => {
              // Optimistic update
              setOptimisticStatuses(prev => ({
                ...prev,
                [issue.id]: IssueStatus.DISMISSED,
              }));

              try {
                await updateIssueStatusService(
                  house,
                  issue.id,
                  IssueStatus.DISMISSED,
                );
                invalidateHouse();

                setOptimisticStatuses(prev => {
                  const next = { ...prev };
                  delete next[issue.id];
                  return next;
                });

                notify(
                  'Issue Dismissed',
                  'Issue was marked as dismissed',
                  [],
                  'succeed',
                );
              } catch (err) {
                logException(err);
                setOptimisticStatuses(prev => {
                  const next = { ...prev };
                  delete next[issue.id];
                  return next;
                });
                notify('Action Failed', 'Failed to dismiss issue', [], 'fail');
              }
            },
          },
        ],
      );
    },
    [house, dispatch, notify],
  );

  // ─── Filter modal ─────────────────────────────────────────────────────────
  const openFilters = useCallback(() => {
    showFormModal(
      <IssueFilterForm
        dismissModal={dismissFormModal}
        guests={guests || {}}
        setSearchFilters={setFilters}
        filters={filters}
      />,
    );
  }, [showFormModal, dismissFormModal, guests, filters]);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
  }, []);

  const executeSearch = useCallback(() => {}, []);

  const renderSearch = useCallback(
    (placeholder?: string) => {
      return (
        <RatsSearchBar
          container={{ marginBottom: 5 }}
          onSubmitEditing={executeSearch}
          value={searchTerm}
          onChangeText={setSearchTerm}
          onFilter={openFilters}
          placeholder={placeholder ? placeholder : 'Search issues...'}
        />
      );
    },
    [executeSearch, searchTerm, setSearchTerm, openFilters],
  );

  // ─── Render single issue card ─────────────────────────────────────────────
  const renderIssue = useCallback(
    (info: ListRenderItemInfo<HouseIssue>) => {
      if (!house) return null;

      const issue = info.item;
      const issueUser = guests?.[issue.issuer] || admins?.[issue.issuer];
      const status = getEffectiveStatus(issue);
      const statusCfg = STATUS_CONFIG[status];

      // Issues that are RESOLVED or DISMISSED are visually muted
      const isClosed =
        status === IssueStatus.RESOLVED || status === IssueStatus.DISMISSED;

      // Colour-tinted left border so status is visible at a glance
      const cardBorderStyle: ViewStyle = {
        borderLeftWidth: 4,
        borderLeftColor: statusCfg.borderColor,
        opacity: isClosed ? 0.7 : 1,
      };

      return (
        <View
          key={issue.id}
          style={cardBorderStyle}
          testID={`issue-row-${issue.id}`}>
          <AuthConsumer>
            {({ token }) => (
              // Long-press on the entire card triggers Dismiss for admins on
              // open/in-progress issues. We wrap in TouchableOpacity so that
              // CardItem itself needs no changes.
              <TouchableOpacity
                activeOpacity={1}
                onLongPress={
                  isAdmin(token, house.id) && !isClosed
                    ? handleDismissIssue(issue)
                    : undefined
                }>
                <CardItem
                  headerSubtext={getDateAndTime(
                    issue.createdAt ?? issue.createdDate,
                  )}
                  avatarName={
                    issueUser
                      ? issueUser.firstName + ' ' + issueUser.lastName
                      : 'Unknown'
                  }
                  avatarUri={issueUser?.avatar || undefined}
                  activityItems={
                    <Fragment>
                      {/* Primary issue description */}
                      <ActivityItem
                        testID={`issue-description-${issue.id}`}
                        container={{ marginBottom: normalize(10) }}
                        boxedIconName={ISSUE_MAP[issue.type].icon}
                        boxedIconBackground={ISSUE_MAP[issue.type].color}
                        description={issue.description}
                        descriptionHeader={camelCaseToDisplayForm(issue.type)}
                      />

                      {/* Status badge row — always shown (replaces legacy resolved-only check) */}
                      <ActivityItem
                        testID={`issue-status-${issue.id}`}
                        container={{ marginBottom: normalize(10) }}
                        boxedIconName={statusCfg.iconName}
                        boxedIconBackground={statusCfg.iconBg}
                        descriptionHeader={statusCfg.label}
                        description={
                          status === IssueStatus.RESOLVED
                            ? issue.resolution ||
                              'This issue has been resolved.'
                            : status === IssueStatus.DISMISSED
                            ? issue.resolution || 'This issue was dismissed.'
                            : status === IssueStatus.IN_PROGRESS
                            ? 'Being worked on.'
                            : 'Awaiting resolution.'
                        }
                      />
                    </Fragment>
                  }
                  leftButtonProps={
                    isAdmin(token, house.id)
                      ? {
                          // Remove is only enabled once the issue is closed
                          disabled: !isClosed,
                          onPress: handleRemoveIssue(issue),
                          title: 'Remove',
                        }
                      : undefined
                  }
                  rightButtonProps={
                    isAdmin(token, house.id)
                      ? {
                          // RESOLVE is only enabled on open/in-progress issues
                          disabled: isClosed,
                          onPress: handleResolveIssue(issue),
                          title: 'RESOLVE',
                        }
                      : undefined
                  }
                />
              </TouchableOpacity>
            )}
          </AuthConsumer>
        </View>
      );
    },
    [
      guests,
      admins,
      house,
      handleRemoveIssue,
      handleResolveIssue,
      handleDismissIssue,
      getEffectiveStatus,
    ],
  );

  const renderIssueList = useCallback(
    (issuesList: HouseIssue[]) => {
      return (
        <RatsFlatList<HouseIssue>
          scrollEnabled
          renderItem={renderIssue}
          data={issuesList}
          keyExtractor={(item, index) => item.id}
          removeClippedSubviews={true}
          initialNumToRender={5}
          maxToRenderPerBatch={1}
          updateCellsBatchingPeriod={100}
          windowSize={7}
        />
      );
    },
    [renderIssue],
  );

  const nameMatchesTerm = useCallback(
    (issue: HouseIssue) => {
      const issueUser = guests?.[issue.issuer] || admins?.[issue.issuer];
      const name = issueUser
        ? issueUser.firstName + ' ' + issueUser.lastName
        : '';
      return name.toLowerCase().includes(searchTerm.toLowerCase());
    },
    [searchTerm, guests, admins],
  );

  // ─── Build filtered + sorted issue list ───────────────────────────────────
  const renderIssues = useCallback(() => {
    if (!house?.issues) return renderIssueList([]);

    // getSortedIssues handles the OPEN-first ordering via STATUS_SORT_ORDER
    const sorted = getSortedIssues(house.issues);

    const filtered = sorted.filter(issue => {
      const issueUser = guests?.[issue.issuer] || admins?.[issue.issuer];
      const effectiveStatus = getEffectiveStatus(issue);

      if (filters) {
        // Status filter (new)
        if (filters.status && filters.status !== 'all') {
          if (effectiveStatus !== filters.status) return false;
        }
        // Type filter
        if (filters.type && filters.type !== 'all') {
          if (filters.type !== issue.type) return false;
        }
        // Guest filter
        if (filters.guest) {
          if (filters.guest.id !== issueUser?.id) return false;
        }
      }

      return searchTerm ? nameMatchesTerm(issue) : true;
    });

    return renderIssueList(filtered);
  }, [
    house,
    guests,
    admins,
    filters,
    searchTerm,
    nameMatchesTerm,
    renderIssueList,
    getEffectiveStatus,
  ]);

  const renderHelp = useCallback(() => {
    showPopover(
      'ISSUES',
      'Here you can view issues that are going on within the house.',
    );
  }, [showPopover]);

  if (!house) {
    return null; // Or loading indicator
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        renderBackButton
        container={{ marginBottom: 1 }}
        icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
        header="Issues"
      />
      {renderSearch()}
      {renderIssues()}
    </View>
  );
};

export default IssueScreen;
