import React from 'react';
import { View, ViewStyle, ActivityIndicator } from 'react-native';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import RatsScrollView from '../../../components/rats-scroll-view';
import { RatsText } from '../../../components/rats-text';
import ScreenHeader from '../../../components/screen-header';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests, useWeekSummary } from '../../../state/queries';
import { Guest } from '../../../entities/Guest';
import { Guests } from '../../../types';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
  fontFamily,
} from '../../../styles/theme';
import { getStartOfWeekInTimezone } from '../../../util/dateWithTimezone';

// ─── Styles ──────────────────────────────────────────────────────────────────

const STAT_CARD: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(20),
  paddingHorizontal: normalize(16),
  alignItems: 'center',
};

const PROGRESS_BAR_BG: ViewStyle = {
  height: normalize(10),
  backgroundColor: color.light_grey,
  borderRadius: normalize(5),
  width: '100%',
  overflow: 'hidden',
  marginTop: normalize(8),
};

const SECTION_HEADER: ViewStyle = {
  ...CARD_STYLE,
  paddingVertical: normalize(10),
  paddingHorizontal: normalize(16),
  marginBottom: 2,
  borderLeftWidth: 4,
  borderLeftColor: color.green,
};

const GUEST_STATUS_CARD: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(14),
  paddingHorizontal: normalize(16),
  flexDirection: 'row',
  alignItems: 'center',
};

const STATUS_PILL_DONE: ViewStyle = {
  backgroundColor: color.baby_green,
  borderRadius: normalize(12),
  paddingHorizontal: normalize(10),
  paddingVertical: normalize(4),
  marginLeft: 'auto',
};

const STATUS_PILL_PENDING: ViewStyle = {
  backgroundColor: color.light_grey,
  borderRadius: normalize(12),
  paddingHorizontal: normalize(10),
  paddingVertical: normalize(4),
  marginLeft: 'auto',
  borderWidth: 1,
  borderColor: color.medium_grey,
};

const AVATAR_CIRCLE: ViewStyle = {
  width: normalize(38),
  height: normalize(38),
  borderRadius: normalize(19),
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: normalize(12),
  flexShrink: 0,
};

// ─── GuestSummaryRow ──────────────────────────────────────────────────────────

interface GuestSummaryRowProps {
  guest: Guest;
  weekStart: string;
}

const GuestSummaryRow: React.FC<GuestSummaryRowProps> = ({
  guest,
  weekStart,
}) => {
  const { data: weekSummary, isLoading } = useWeekSummary(guest.id, weekStart);
  const completed = (weekSummary?.stats?.choresCompleted ?? 0) > 0;
  const initials = `${guest.firstName?.[0] ?? ''}${
    guest.lastName?.[0] ?? ''
  }`.toUpperCase();
  const avatarBg = completed ? color.light_green : color.medium_blue;

  return (
    <View style={GUEST_STATUS_CARD} testID={`summary-row-${guest.id}`}>
      <View style={[AVATAR_CIRCLE, { backgroundColor: avatarBg }]}>
        <RatsText
          translate={false}
          text={initials || '?'}
          style={{
            color: color.white,
            fontSize: fontSize.small,
            fontFamily: fontFamily.bold,
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <RatsText
          translate={false}
          text={
            `${guest.firstName || ''} ${guest.lastName || ''}`.trim() ||
            'Resident'
          }
          style={{
            fontSize: fontSize.regular_medium,
            color: color.black,
            fontFamily: fontFamily.bold,
          }}
        />
        {guest.currentChore ? (
          <RatsText
            translate={false}
            text={guest.currentChore}
            style={{ fontSize: fontSize.small, color: color.dark_grey }}
          />
        ) : (
          <RatsText
            translate={false}
            text="No chore assigned"
            style={{ fontSize: fontSize.small, color: color.grey }}
          />
        )}
      </View>
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={color.baby_blue}
          style={{ marginLeft: 'auto' }}
        />
      ) : (
        <View style={completed ? STATUS_PILL_DONE : STATUS_PILL_PENDING}>
          <RatsText
            translate={false}
            text={completed ? 'Completed' : 'Pending'}
            style={{
              fontSize: fontSize.extraSmall,
              color: completed ? color.green : color.dark_grey,
              fontFamily: completed ? fontFamily.bold : fontFamily.roboto,
            }}
          />
        </View>
      )}
    </View>
  );
};

// ─── HouseChoreSummary ────────────────────────────────────────────────────────

/**
 * Renders a horizontal progress bar for the completion rate.
 */
const CompletionBar: React.FC<{ completed: number; total: number }> = ({
  completed,
  total,
}) => {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const barColor =
    pct >= 80 ? color.green : pct >= 50 ? color.yellow : color.red;

  return (
    <View style={{ width: '100%' }}>
      <View style={PROGRESS_BAR_BG} testID="completion-bar-bg">
        <View
          testID="completion-bar-fill"
          style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: barColor,
            borderRadius: normalize(5),
          }}
        />
      </View>
      <RatsText
        translate={false}
        text={`${pct}% completion rate`}
        style={{
          fontSize: fontSize.small,
          color: color.dark_grey,
          marginTop: normalize(6),
        }}
      />
    </View>
  );
};

const HouseChoreSummary: React.FC = () => {
  const { house } = useSelectedHouse();
  // React Query is the sole source of truth for guests; see .full-review [A2].
  const { data: queryGuests } = useGuests(house?.id || '', !!house?.id);
  const guests: Guests = queryGuests || {};

  const weekStart = getStartOfWeekInTimezone(undefined, house?.timezone);

  if (!house) {
    return <RatsLoadingIndicator />;
  }

  const guestList = (Object.values(guests) as Guest[]).filter(
    g => g.status === 'active' || !g.status,
  );

  // Count guests with chore assignments (for the summary stat)
  const assignedGuests = guestList.filter(g => !!g.currentChore);
  const totalGuests = guestList.length;

  // Week label
  const weekLabel = weekStart ? `Week of ${weekStart}` : 'Current Week';

  return (
    <RatsScrollView
      testID="chore-summary-scroll"
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: color.light_grey,
      }}>
      <ScreenHeader header="Chore Summary" />

      {/* Week summary stat card */}
      <View
        style={[STAT_CARD, { marginTop: normalize(8) }]}
        testID="chore-summary-stat-card">
        <RatsText
          translate={false}
          text={weekLabel}
          style={{
            fontSize: fontSize.small,
            color: color.dark_grey,
            letterSpacing: 0.8,
            marginBottom: normalize(12),
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <RatsText
            translate={false}
            text={`${assignedGuests.length}`}
            style={{
              fontSize: fontSize.extraLarge,
              color: color.baby_blue,
              fontFamily: fontFamily.bold,
            }}
          />
          <RatsText
            translate={false}
            text={` / ${totalGuests}`}
            style={{ fontSize: fontSize.large, color: color.dark_grey }}
          />
        </View>
        <RatsText
          translate={false}
          text="residents assigned a chore"
          style={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
            marginBottom: normalize(12),
          }}
        />
        <CompletionBar completed={assignedGuests.length} total={totalGuests} />
      </View>

      {/* Per-guest status */}
      <View style={[SECTION_HEADER, { marginTop: normalize(8) }]}>
        <RatsText
          translate={false}
          text="RESIDENT STATUS"
          style={{
            fontSize: fontSize.small,
            color: color.dark_grey,
            fontFamily: fontFamily.bold,
            letterSpacing: 0.8,
          }}
        />
      </View>

      {guestList.length === 0 ? (
        <View
          style={[STAT_CARD, { paddingVertical: normalize(32) }]}
          testID="chore-summary-empty">
          <RatsText
            translate={false}
            text="No residents found"
            style={{ fontSize: fontSize.medium, color: color.dark_grey }}
          />
          <RatsText
            translate={false}
            text="Add residents to track chore completion"
            style={{
              fontSize: fontSize.regular,
              color: color.grey,
              marginTop: normalize(6),
            }}
          />
        </View>
      ) : (
        guestList.map(guest => (
          <GuestSummaryRow key={guest.id} guest={guest} weekStart={weekStart} />
        ))
      )}
    </RatsScrollView>
  );
};

export default HouseChoreSummary;
