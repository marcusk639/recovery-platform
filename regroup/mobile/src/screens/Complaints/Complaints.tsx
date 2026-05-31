import React, { useState, useCallback, Fragment } from 'react';
import { Guests, Admins } from '../../types';
import { House } from '../../entities/House';
import { ListRenderItemInfo, View, Alert } from 'react-native';
import { CardItem, ActivityItem } from '../../components/card-list/card-list';
import { getCurrentTime, getDateAndTime } from '../../util/display';
import { color, normalize, CARD_STYLE } from '../../styles/theme';
import { RatsFlatList } from '../../components/rats-flat-list';
import { User } from '../../entities/User';
import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import { toArray } from 'lodash';
// Phase 3.3: Migrated from 3 HOC layers to Context hooks
// Removed: withFormModal, withNotifier, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../context';
import { Formik } from 'formik';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsSearchBar from '../../components/rats-search-bar';
import { Complaint } from '../../entities/Complaint';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthConsumer } from '../../context/auth';
import { isAdmin } from '../../util/roles';
import {
  ComplaintFilterFormValues,
  ComplaintsFilterForm,
} from './ComplaintsFilter';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppSelector } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';
import { useUpdateHouse } from '../../state/queries/houseQueries';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Complaints Screen
 *
 * Displays and manages house complaints. Admins can reply to and remove complaints.
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
 */
const ComplaintScreen: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 3 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { notify, showPopover, setPopoverRef } = useNotification();
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTermState] = useState('');
  const [filters, setFilters] = useState<ComplaintFilterFormValues>(
    new ComplaintFilterFormValues(),
  );

  const updateHouseMutation = useUpdateHouse();

  // RTK Typed Selectors (no more 'as any')
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const admins = useAppSelector(state => state.admin.houseAdmins);

  // Derived data
  const complaints = house?.complaints ? toArray(house.complaints) : [];

  const removeComplaint = useCallback(
    (complaint: Complaint) => () => {
      if (!house) return;

      return Alert.alert(
        'Confirm Removal',
        'Are you sure you want to remove this complaint?',
        [
          { text: 'Cancel', onPress: () => null },
          {
            text: 'Continue',
            onPress: async () => {
              // Remove complaint from house.complaints object
              const updatedComplaints = { ...house.complaints };
              delete updatedComplaints[complaint.id];

              await updateHouseMutation.mutateAsync({
                houseId: house.id,
                values: {
                  complaints: updatedComplaints,
                },
              });

              notify(
                'Complaint Removed',
                'Complaint was successfully removed',
                [],
                'succeed',
              );
            },
          },
        ],
      );
    },
    [updateHouseMutation, house, notify],
  );

  const handleReplySubmission = useCallback(
    async (values: { reply: string; id: string }) => {
      if (!house) return;

      dismissFormModal();
      setError(null);

      try {
        await updateHouseMutation.mutateAsync({
          houseId: house.id,
          values: {
            complaints: {
              ...house.complaints,
              [values.id]: {
                ...house.complaints[values.id],
                reply: values.reply,
                updatedAt: getCurrentTime(),
              },
            },
          },
        });

        notify(
          'Reply Submitted',
          'Reply was successfully submitted',
          [],
          'succeed',
        );
      } catch (error) {
        notify('Reply Failed', 'Reply failed to submit', [], 'fail');
        setError('Something went wrong');
      }
    },
    [updateHouseMutation, house, dismissFormModal, notify],
  );

  const renderModalForm = useCallback(
    (complaint: Complaint) => {
      const complaintUser =
        guests?.[complaint.plaintiff] || admins?.[complaint.plaintiff];

      return (
        <RatsScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, width: '100%' }}>
          <CardItem
            headerSubtext={getDateAndTime(
              complaint.createdAt ?? complaint.createdDate,
            )}
            container={{ marginBottom: 1 }}
            avatarName={
              complaintUser
                ? complaintUser.firstName + ' ' + complaintUser.lastName
                : 'Anonymous'
            }
            avatarUri={complaintUser?.avatar || undefined}
            activityItems={
              <ActivityItem
                container={{ marginBottom: normalize(10) }}
                boxedIconName="hand-paper"
                boxedIconBackground={color.baby_green}
                description={complaint.description}
                descriptionHeader="Complaint"
              />
            }
          />
          <Formik
            initialValues={{ reply: '', id: complaint.id }}
            onSubmit={handleReplySubmission}>
            {({ handleSubmit, values }) => (
              <View style={{ flex: 1 }}>
                <View style={[CARD_STYLE, { marginBottom: 2 }]}>
                  {renderField(
                    'reply',
                    'Enter reply...',
                    RatsTextInput,
                    false,
                    'Reply',
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
        </RatsScrollView>
      );
    },
    [guests, admins, dismissFormModal, handleReplySubmission],
  );

  const replyToComplaint = useCallback(
    (complaint: Complaint) => () => {
      showFormModal(renderModalForm(complaint), 'Complaint Reply', true);
    },
    [showFormModal, renderModalForm],
  );

  const openFilters = useCallback(() => {
    showFormModal(
      <ComplaintsFilterForm
        dismissModal={dismissFormModal}
        guests={guests || {}}
        setSearchFilters={setFilters}
        filters={filters}
      />,
    );
  }, [showFormModal, dismissFormModal, guests, filters]);

  const setSearchTerm = useCallback((searchTerm: string) => {
    setSearchTermState(searchTerm);
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
          placeholder={placeholder || 'Search complaints...'}
        />
      );
    },
    [searchTerm, setSearchTerm, executeSearch, openFilters],
  );

  const nameMatchesTerm = useCallback(
    (complaint: Complaint) => {
      const complaintUser =
        guests?.[complaint.plaintiff] || admins?.[complaint.plaintiff];
      const name = complaintUser
        ? complaintUser.firstName + ' ' + complaintUser.lastName
        : '';
      return name.toLowerCase().includes(searchTerm.toLowerCase());
    },
    [guests, admins, searchTerm],
  );

  const renderComplaint = useCallback(
    (info: ListRenderItemInfo<Complaint>) => {
      if (!house) return null;

      const complaint = info.item;
      const complaintUser =
        guests?.[complaint.plaintiff] || admins?.[complaint.plaintiff];
      const repliedTo = complaint.reply && complaint.reply.length > 0;

      return (
        <View key={complaint.id}>
          <AuthConsumer>
            {({ token }) => (
              <CardItem
                headerSubtext={getDateAndTime(
                  complaint.createdAt ?? complaint.createdDate,
                )}
                avatarName={
                  complaintUser
                    ? complaintUser.firstName + ' ' + complaintUser.lastName
                    : 'Anonymous'
                }
                avatarUri={complaintUser?.avatar || undefined}
                activityItems={
                  <Fragment>
                    <ActivityItem
                      container={{ marginBottom: normalize(10) }}
                      boxedIconName="hand-paper"
                      boxedIconBackground={color.baby_green}
                      description={
                        complaint.description.length
                          ? complaint.description
                          : 'No description'
                      }
                      descriptionHeader="Complaint"
                    />
                    {repliedTo ? (
                      <ActivityItem
                        container={{ marginBottom: normalize(10) }}
                        boxedIconName="comment-dots"
                        boxedIconBackground={color.grey}
                        description={
                          complaint.reply.length ? complaint.reply : 'No reply'
                        }
                        descriptionHeader="Manager's Reply"
                      />
                    ) : null}
                  </Fragment>
                }
                leftButtonProps={
                  isAdmin(token, house.id)
                    ? {
                        disabled: !complaint.reply,
                        onPress: removeComplaint(complaint),
                        title: 'REMOVE',
                      }
                    : undefined
                }
                rightButtonProps={
                  isAdmin(token, house.id)
                    ? {
                        disabled: Boolean(
                          complaint.reply && complaint.reply.length > 0,
                        ),
                        onPress: replyToComplaint(complaint),
                        title: 'REPLY',
                      }
                    : undefined
                }
              />
            )}
          </AuthConsumer>
        </View>
      );
    },
    [guests, admins, house, removeComplaint, replyToComplaint],
  );

  const renderComplaintList = useCallback(
    (complaintsToRender: Complaint[]) => {
      return (
        <RatsFlatList<Complaint>
          scrollEnabled
          contentContainerStyle={{ backgroundColor: color.light_grey }}
          renderItem={renderComplaint}
          data={complaintsToRender}
          keyExtractor={(item, index) => item.id}
          removeClippedSubviews={true}
          initialNumToRender={5}
          maxToRenderPerBatch={1}
          updateCellsBatchingPeriod={100}
          windowSize={7}
        />
      );
    },
    [renderComplaint],
  );

  const renderComplaints = useCallback(() => {
    let filteredComplaints = complaints.filter(complaint => {
      const complaintUser =
        guests?.[complaint.plaintiff] || admins?.[complaint.plaintiff];

      if (filters) {
        if (filters.guest) {
          if (filters.guest.id !== complaintUser?.id) {
            return false;
          }
        }
      }

      return searchTerm ? nameMatchesTerm(complaint) : true;
    });

    const sortedComplaints = filteredComplaints.sort((left, right) => {
      return (
        new Date(right.createdAt ?? right.createdDate).getTime() -
        new Date(left.createdAt ?? left.createdDate).getTime()
      );
    });

    return renderComplaintList(sortedComplaints);
  }, [
    complaints,
    guests,
    admins,
    filters,
    searchTerm,
    nameMatchesTerm,
    renderComplaintList,
  ]);

  const renderHelp = useCallback(() => {
    showPopover(
      'COMPLAINTS',
      'Here you can view any complaints related to the house.',
    );
  }, [showPopover]);

  if (!house) {
    return null; // Or loading indicator
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: color.light_grey }}>
        <ScreenHeader
          renderBackButton
          container={{ marginBottom: 1 }}
          icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
          header="Complaints"
        />
        {renderSearch()}
        {renderComplaints()}
      </View>
    </SafeAreaView>
  );
};

export default ComplaintScreen;
