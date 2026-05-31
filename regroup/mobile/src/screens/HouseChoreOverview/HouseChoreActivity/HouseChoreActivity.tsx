import React from 'react';
import { View, FlatList, ViewStyle, ListRenderItemInfo } from 'react-native';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import { RatsText } from '../../../components/rats-text';
import ScreenHeader from '../../../components/screen-header';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests, useWeekSummary } from '../../../state/queries';
import { Guest } from '../../../entities/Guest';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
  fontFamily,
} from '../../../styles/theme';
import { getStartOfWeekInTimezone } from '../../../util/dateWithTimezone';
import { Guests } from '../../../types';

// ─── Styles ──────────────────────────────────────────────────────────────────

const CONTAINER: ViewStyle = {
  flexGrow: 1,
  backgroundColor: color.light_grey,
};

const CARD: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(14),
  paddingHorizontal: normalize(16),
};

const GUEST_ROW: ViewStyle = {
  ...ROW,
  alignItems: 'center',
};

const CHORE_BADGE: ViewStyle = {
  backgroundColor: color.light_blue,
  borderRadius: normalize(4),
  paddingHorizontal: normalize(8),
  paddingVertical: normalize(3),
  marginTop: normalize(4),
  alignSelf: 'flex-start',
};

const COMPLETE_BADGE: ViewStyle = {
  backgroundColor: color.baby_green,
  borderRadius: normalize(12),
  paddingHorizontal: normalize(8),
  paddingVertical: normalize(3),
  marginLeft: 'auto',
  alignSelf: 'center',
};

const INCOMPLETE_BADGE: ViewStyle = {
  backgroundColor: color.light_grey,
  borderRadius: normalize(12),
  paddingHorizontal: normalize(8),
  paddingVertical: normalize(3),
  marginLeft: 'auto',
  alignSelf: 'center',
  borderWidth: 1,
  borderColor: color.medium_grey,
};

const AVATAR_CIRCLE: ViewStyle = {
  width: normalize(40),
  height: normalize(40),
  borderRadius: normalize(20),
  backgroundColor: color.baby_blue,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: normalize(12),
  flexShrink: 0,
};

const EMPTY_CONTAINER: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: normalize(60),
};

// ─── GuestChoreRow ────────────────────────────────────────────────────────────

interface GuestChoreRowProps {
  guest: Guest;
  houseId: string;
  weekStart: string;
}

const GuestChoreRow: React.FC<GuestChoreRowProps> = ({
  guest,
  houseId,
  weekStart,
}) => {
  const { data: weekSummary } = useWeekSummary(guest.id, weekStart);
  const choreCompleted = (weekSummary?.stats?.choresCompleted ?? 0) > 0;
  const choreName = guest.currentChore || 'No chore assigned';
  const hasChore = !!guest.currentChore;
  const initials = `${guest.firstName?.[0] ?? ''}${
    guest.lastName?.[0] ?? ''
  }`.toUpperCase();

  return (
    <View style={CARD} testID={`chore-row-${guest.id}`}>
      <View style={GUEST_ROW}>
        {/* Avatar circle with initials */}
        <View style={AVATAR_CIRCLE}>
          <RatsText
            translate={false}
            text={initials || '?'}
            style={{
              color: color.white,
              fontSize: fontSize.regular,
              fontFamily: fontFamily.bold,
            }}
          />
        </View>

        {/* Name and chore */}
        <View style={{ flex: 1 }}>
          <RatsText
            translate={false}
            text={
              `${guest.firstName || ''} ${guest.lastName || ''}`.trim() ||
              'Resident'
            }
            style={{
              fontSize: fontSize.medium,
              color: color.black,
              fontFamily: fontFamily.bold,
            }}
          />
          <View style={CHORE_BADGE}>
            <RatsText
              translate={false}
              text={choreName}
              style={{
                fontSize: fontSize.small,
                color: hasChore ? color.cobalt : color.dark_grey,
              }}
            />
          </View>
        </View>

        {/* Completion status badge */}
        <View style={choreCompleted ? COMPLETE_BADGE : INCOMPLETE_BADGE}>
          <RatsText
            translate={false}
            text={choreCompleted ? 'Done' : 'Pending'}
            style={{
              fontSize: fontSize.extraSmall,
              color: choreCompleted ? color.green : color.dark_grey,
              fontFamily: choreCompleted ? fontFamily.bold : fontFamily.roboto,
            }}
          />
        </View>
      </View>
    </View>
  );
};

// ─── HouseChoreActivity ───────────────────────────────────────────────────────

const HouseChoreActivity: React.FC = () => {
  const { house } = useSelectedHouse();
  // React Query is the sole source of truth for guests; see .full-review [A2].
  const { data: queryGuests } = useGuests(house?.id || '', !!house?.id);
  const guests: Guests = queryGuests || {};

  const weekStart = getStartOfWeekInTimezone(undefined, house?.timezone);
  const guestList = Object.values(guests) as Guest[];
  const activeGuests = guestList.filter(
    g => g.status === 'active' || !g.status,
  );

  if (!house) {
    return <RatsLoadingIndicator />;
  }

  const renderGuest = (info: ListRenderItemInfo<Guest>) => (
    <GuestChoreRow guest={info.item} houseId={house.id} weekStart={weekStart} />
  );

  const renderEmpty = () => (
    <View style={EMPTY_CONTAINER} testID="chore-activity-empty">
      <RatsText
        translate={false}
        text="No residents found"
        style={{ fontSize: fontSize.medium, color: color.dark_grey }}
      />
      <RatsText
        translate={false}
        text="Add residents to see chore assignments"
        style={{
          fontSize: fontSize.regular,
          color: color.grey,
          marginTop: normalize(8),
        }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader header="Chore Assignments" />
      <View
        style={{ paddingHorizontal: normalize(0), paddingTop: normalize(8) }}>
        <View
          style={[
            CARD_STYLE,
            {
              paddingVertical: normalize(10),
              paddingHorizontal: normalize(16),
              marginBottom: 2,
            },
          ]}>
          <RatsText
            translate={false}
            text={`${activeGuests.filter(g => !!g.currentChore).length} of ${
              activeGuests.length
            } residents assigned`}
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
        </View>
      </View>
      <FlatList
        testID="chore-activity-list"
        data={activeGuests}
        keyExtractor={item => item.id}
        renderItem={renderGuest}
        ListEmptyComponent={renderEmpty}
        scrollEnabled={true}
        contentContainerStyle={CONTAINER}
        removeClippedSubviews={true}
      />
    </View>
  );
};

export default HouseChoreActivity;
