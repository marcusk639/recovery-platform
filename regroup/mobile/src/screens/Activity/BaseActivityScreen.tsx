import React, { Fragment } from 'react';
import { View, ListRenderItemInfo } from 'react-native';
import {
  normalize,
  CARD_STYLE,
  MODAL_STYLE,
  MODAL_CONTAINER_STYLE,
  color,
} from '../../styles/theme';
import { STAT_MAP, getDateAndTime } from '../../util/display';
import { Activity, ActivityType } from '../../entities/ActivityModel';
import { Guest } from '../../entities/Guest';
import { Guests, Admins } from '../../types';
import { CardItem, ActivityItem } from '../../components/card-list/card-list';
import { AuthConsumer } from '../../context/auth';
import { RatsFlatList } from '../../components/rats-flat-list';
import RatsSearchBar from '../../components/rats-search-bar';
import RatsModal from '../../components/rats-modal';
import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import { Formik } from 'formik';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { getDisputesForActivity, getChallengesFromDisputes } from '../../util/house';
import { isAdmin } from '../../util/roles';
import { RoleToken } from '../../components/auth/auth';
import Admin from '../../entities/Admin';
import { Dispute } from '../../entities/Dispute';
import { useBaseActivityScreen } from '../../hooks/useBaseActivityScreen';

export function getActivityDescription(activity: Activity): string {
  const d = activity.data as any;
  return d?.meetingName ?? d?.jobName ?? d?.choreName ?? d?.medicationName ?? d?.supporterName ?? 'Activity completed';
}

interface RenderSearchProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onFilter: () => void;
  placeholder?: string;
}

export const RenderSearch: React.FC<RenderSearchProps> = ({
  searchTerm,
  setSearchTerm,
  onFilter,
  placeholder,
}) => {
  return (
    <RatsSearchBar
      container={{ marginBottom: 5 }}
      onSubmitEditing={() => {}}
      value={searchTerm}
      onChangeText={setSearchTerm}
      onFilter={onFilter}
      placeholder={placeholder || 'Search activity feed...'}
    />
  );
};

interface RenderModalProps {
  modalVisible: boolean;
  modalType: 'dispute' | 'confirm' | '';
  selectedActivity: Activity | null;
  guests: Guests;
  getIconForActivity: (activity: Activity) => string;
  dismissModal: () => void;
  handleDisputeSubmission: (values: { message: string }) => Promise<boolean>;
  setModalShowing?: (showing: boolean) => void;
}

export const RenderModal: React.FC<RenderModalProps> = ({
  modalVisible,
  modalType,
  selectedActivity,
  guests,
  getIconForActivity,
  dismissModal,
  handleDisputeSubmission,
  setModalShowing,
}) => {
  const currentActivity = selectedActivity || { guestId: '', type: ActivityType.MEETING, data: { type: 'meeting', meetingName: '', meetingType: '', duration: 0 }, timestamp: '' } as unknown as Activity;
  const activityGuest = guests[currentActivity.guestId] || {
    firstName: '',
    lastName: '',
    avatar: '',
  };
  const confirm = modalType === 'confirm';

  const RatsModalAny = RatsModal as any;
  return (
    <RatsModalAny
      testID={modalType === 'confirm' ? 'challenge-modal' : 'dispute-modal'}
      modalStyle={MODAL_STYLE}
      style={MODAL_CONTAINER_STYLE}
      animationIn="slideInRight"
      animationOut="slideOutRight"
      onModalHide={() => setModalShowing?.(false)}
      onModalShow={() => setModalShowing?.(true)}
      isVisible={modalVisible}
      onBackButtonPress={dismissModal}
      onSwipeComplete={dismissModal}
      swipeDirection="right"
      fullScreen
      onBackdropPress={dismissModal}>
      <RatsScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 1 }}>
        <View style={{ width: '100%' }}>
          <ScreenHeader
            renderBackButton
            onBackPress={dismissModal}
            header={modalType === 'confirm' ? 'Confirm Activity' : 'Dispute Activity'}
          />
        </View>
        <CardItem
          container={{ marginBottom: 1 }}
          avatarName={activityGuest.firstName + ' ' + activityGuest.lastName}
          avatarUri={activityGuest.avatar}
          headerSubtext={getDateAndTime(currentActivity.timestamp)}
          iconName={getIconForActivity(currentActivity)}
          activityItems={
            <ActivityItem
              boxedIconName={STAT_MAP[currentActivity.type]?.icon}
              boxedIconBackground={STAT_MAP[currentActivity.type]?.color}
              description={getActivityDescription(currentActivity)}
              descriptionHeader={STAT_MAP[currentActivity.type]?.activityLabel}
            />
          }
        />
        <Formik
          initialValues={{ message: '' }}
          onSubmit={handleDisputeSubmission}>
          {({ handleSubmit }) => (
            <Fragment>
              <View style={[CARD_STYLE, { marginBottom: 2 }]} testID={modalType === 'confirm' ? 'challenge-message-input' : 'dispute-message-input'}>
                {renderField(
                  'message',
                  'Enter a reason...',
                  RatsTextInput as any,
                  false,
                  'Reason (optional)',
                  'string',
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  8,
                )}
                <RatsText
                  text="Remember, your confirmations and reasons are always reported anonymously."
                  translate={false}
                  style={{ color: color.dark_grey }}
                />
              </View>
              <View
                style={[CARD_STYLE, { marginBottom: 0, marginTop: 'auto' }]}>
                <RatsButton
                  testID={confirm ? 'submit-challenge-button' : 'dispute-submit-button'}
                  title={confirm ? 'CONFIRM' : 'DISPUTE'}
                  containerStyle={{
                    backgroundColor: confirm ? color.green : color.red,
                    borderColor: confirm ? color.green : color.red,
                    borderWidth: 2,
                  }}
                  style={{ color: color.white }}
                  onPress={handleSubmit as any}
                />
              </View>
            </Fragment>
          )}
        </Formik>
      </RatsScrollView>
    </RatsModalAny>
  );
};

interface RenderActivityProps {
  info: ListRenderItemInfo<Activity>;
  disputesOnly?: boolean;
  guests: Guests;
  admins: Admins;
  disputes: { [key: string]: Dispute };
  houseId: string;
  userIsAdmin: boolean;
  getIconForActivity: (activity: Activity) => string;
  getLeftButtonProps: (activity: Activity, disputesOnly: boolean, token: RoleToken) => any;
  getRightButtonProps: (activity: Activity, disputesOnly: boolean, token: RoleToken) => any;
}

export const RenderActivity: React.FC<RenderActivityProps> = ({
  info,
  disputesOnly = false,
  guests,
  admins,
  disputes,
  houseId,
  userIsAdmin,
  getIconForActivity,
  getLeftButtonProps,
  getRightButtonProps,
}) => {
  const activity = info.item;
  const activityGuest = guests[activity.guestId];

  const renderDisputesAndChallenges = (token: RoleToken) => {
    const activityDisputes = getDisputesForActivity(activity.id, disputes);
    const challenges = getChallengesFromDisputes(activityDisputes);
    const items: JSX.Element[] = [];

    const renderHeader = (member: Admin | Guest, dispute: boolean = false) => {
      if (isAdmin(token, houseId) && member) {
        return member.firstName + ' ' + member.lastName;
      }
      if (!dispute) {
        return 'Dispute Challenge';
      } else {
        return 'Dispute';
      }
    };

    activityDisputes.forEach(dispute => {
      items.push(
        <ActivityItem
          testID={`dispute-item-${dispute.id}`}
          isAdmin={
            token.role[houseId] === 'admin' ||
            token.role[houseId] === 'superAdmin'
          }
          container={{ marginBottom: normalize(10) }}
          key={dispute.id}
          type="bad"
          description={dispute.message}
          descriptionHeader="Anonymous"
        />,
      );
    });

    challenges.forEach(challenge => {
      items.push(
        <ActivityItem
          testID={`challenge-item-${activity.id}-${challenge.challenger}`}
          isAdmin={userIsAdmin}
          container={{ marginBottom: normalize(10) }}
          key={activity.id + challenge.challenger}
          type="good"
          description={challenge.message}
          descriptionHeader={renderHeader(
            guests[challenge.challenger] || admins[challenge.challenger],
          )}
        />,
      );
    });

    return items;
  };

  return (
    <View key={activity.id} testID={`activity-item-${activity.id}`}>
      <AuthConsumer>
        {({ token }) => (
          <CardItem
            headerSubtext={getDateAndTime(activity.timestamp)}
            avatarName={activityGuest?.firstName + ' ' + activityGuest?.lastName}
            avatarUri={activityGuest?.avatar}
            iconName={getIconForActivity(activity)}
            activityItems={
              <Fragment>
                <ActivityItem
                  container={{ marginBottom: normalize(10) }}
                  boxedIconName={STAT_MAP[activity.type]?.icon}
                  boxedIconBackground={STAT_MAP[activity.type]?.color}
                  description={getActivityDescription(activity)}
                  descriptionHeader={STAT_MAP[activity.type]?.activityLabel}
                />
                {/* Verification badge - visible when admin has verified the activity */}
                {activity.verified && (
                  <View testID={`activity-verification-badge-${activity.id}`}>
                    <ActivityItem
                      container={{ marginBottom: normalize(10) }}
                      type="good"
                      description="Verified by admin"
                      descriptionHeader="Verified"
                    />
                  </View>
                )}
                {renderDisputesAndChallenges(token)}
              </Fragment>
            }
            leftButtonProps={getLeftButtonProps(activity, disputesOnly, token)}
            rightButtonProps={getRightButtonProps(activity, disputesOnly, token)}
          />
        )}
      </AuthConsumer>
    </View>
  );
};

interface RenderActivitiesProps {
  activities: Activity[];
  disputesOnly?: boolean;
  guests: Guests;
  admins: Admins;
  disputes: { [key: string]: Dispute };
  houseId: string;
  userIsAdmin: boolean;
  getIconForActivity: (activity: Activity) => string;
  getLeftButtonProps: (activity: Activity, disputesOnly: boolean, token: RoleToken) => any;
  getRightButtonProps: (activity: Activity, disputesOnly: boolean, token: RoleToken) => any;
}

export const RenderActivities: React.FC<RenderActivitiesProps> = ({
  activities,
  disputesOnly = false,
  guests,
  admins,
  disputes,
  houseId,
  userIsAdmin,
  getIconForActivity,
  getLeftButtonProps,
  getRightButtonProps,
}) => {
  return (
    <RatsFlatList<Activity>
      scrollEnabled
      renderItem={info => (
        <RenderActivity
          info={info}
          disputesOnly={disputesOnly}
          guests={guests}
          admins={admins}
          disputes={disputes}
          houseId={houseId}
          userIsAdmin={userIsAdmin}
          getIconForActivity={getIconForActivity}
          getLeftButtonProps={getLeftButtonProps}
          getRightButtonProps={getRightButtonProps}
        />
      )}
      data={activities}
      keyExtractor={(item, index) => item.id}
      removeClippedSubviews={true}
      initialNumToRender={5}
      maxToRenderPerBatch={1}
      updateCellsBatchingPeriod={100}
      windowSize={7}
      ItemSeparatorComponent={() => <View style={{ height: normalize(5) }} />}
    />
  );
};
