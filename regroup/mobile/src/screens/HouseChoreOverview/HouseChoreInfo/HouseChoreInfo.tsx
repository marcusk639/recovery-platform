import React from 'react';
import { View, ViewStyle } from 'react-native';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import RatsScrollView from '../../../components/rats-scroll-view';
import { RatsText } from '../../../components/rats-text';
import ScreenHeader from '../../../components/screen-header';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests } from '../../../state/queries';
import { Guest } from '../../../entities/Guest';
import { Chores } from '../../../entities/Chore';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
  fontFamily,
} from '../../../styles/theme';
import { Guests } from '../../../types';

// ─── Styles ──────────────────────────────────────────────────────────────────

const SECTION_HEADER: ViewStyle = {
  ...CARD_STYLE,
  paddingVertical: normalize(10),
  paddingHorizontal: normalize(16),
  marginBottom: 2,
  borderLeftWidth: 4,
  borderLeftColor: color.baby_blue,
};

const CHORE_ITEM: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(14),
  paddingHorizontal: normalize(16),
  flexDirection: 'row',
  alignItems: 'flex-start',
};

const CHORE_NUMBER: ViewStyle = {
  width: normalize(28),
  height: normalize(28),
  borderRadius: normalize(14),
  backgroundColor: color.baby_blue,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: normalize(12),
  flexShrink: 0,
  marginTop: normalize(2),
};

const ROTATION_ITEM: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(12),
  paddingHorizontal: normalize(16),
  flexDirection: 'row',
  alignItems: 'center',
};

const ROTATION_INDEX: ViewStyle = {
  width: normalize(24),
  height: normalize(24),
  borderRadius: normalize(12),
  backgroundColor: color.light_blue,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: normalize(12),
  flexShrink: 0,
};

const INFO_CARD: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(14),
  paddingHorizontal: normalize(16),
};

// ─── ChoreInfoItem ────────────────────────────────────────────────────────────

interface ChoreInfoItemProps {
  index: number;
  name: string;
  description: string;
  assignedTo?: string;
}

const ChoreInfoItem: React.FC<ChoreInfoItemProps> = ({
  index,
  name,
  description,
  assignedTo,
}) => (
  <View style={CHORE_ITEM} testID={`chore-info-${name}`}>
    <View style={CHORE_NUMBER}>
      <RatsText
        translate={false}
        text={`${index + 1}`}
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
        text={name}
        style={{
          fontSize: fontSize.medium,
          color: color.black,
          fontFamily: fontFamily.bold,
        }}
      />
      <RatsText
        translate={false}
        text={description || 'No description provided.'}
        style={{
          fontSize: fontSize.regular,
          color: color.dark_grey,
          marginTop: normalize(2),
        }}
      />
      {assignedTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: normalize(4),
          }}>
          <RatsText
            translate={false}
            text="Assigned to: "
            style={{ fontSize: fontSize.small, color: color.dark_grey }}
          />
          <RatsText
            translate={false}
            text={assignedTo}
            style={{
              fontSize: fontSize.small,
              color: color.baby_blue,
              fontFamily: fontFamily.bold,
            }}
          />
        </View>
      ) : (
        <View style={{ marginTop: normalize(4) }}>
          <RatsText
            translate={false}
            text="Unassigned"
            style={{ fontSize: fontSize.small, color: color.grey }}
          />
        </View>
      )}
    </View>
  </View>
);

// ─── HouseChoreInfo ───────────────────────────────────────────────────────────

const HouseChoreInfo: React.FC = () => {
  const { house } = useSelectedHouse();
  // React Query is the sole source of truth for guests; see .full-review [A2].
  const { data: queryGuests } = useGuests(house?.id || '', !!house?.id);
  const guests: Guests = queryGuests || {};

  if (!house) {
    return <RatsLoadingIndicator />;
  }

  const chores: Chores = house.chores || {};
  const choreList = Object.values(chores);
  const guestList = (Object.values(guests) as Guest[]).filter(
    g => g.status === 'active' || !g.status,
  );

  // Build a map from chore name to assigned guest name
  const choreToGuest: Record<string, string> = {};
  guestList.forEach(g => {
    if (g.currentChore) {
      const name =
        `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Resident';
      choreToGuest[g.currentChore] = name;
    }
  });

  // Rotation order: guests sorted by name (or move-in date if available)
  const rotationGuests = [...guestList].sort((a, b) => {
    const nameA = `${a.firstName || ''} ${a.lastName || ''}`
      .trim()
      .toLowerCase();
    const nameB = `${b.firstName || ''} ${b.lastName || ''}`
      .trim()
      .toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <RatsScrollView
      testID="chore-info-scroll"
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: color.light_grey,
      }}>
      <ScreenHeader header="Chore Schedule" />

      {/* Summary card */}
      <View
        style={[INFO_CARD, { marginTop: normalize(8) }]}
        testID="chore-info-summary">
        <RatsText
          translate={false}
          text="How chores work"
          style={{
            fontSize: fontSize.medium,
            color: color.black,
            fontFamily: fontFamily.bold,
            marginBottom: normalize(6),
          }}
        />
        <RatsText
          translate={false}
          text="Each resident is assigned one chore per week. Chores rotate so every resident shares household responsibilities equally over time."
          style={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
            lineHeight: normalize(20),
          }}
        />
      </View>

      {/* Chore list */}
      <View style={[SECTION_HEADER, { marginTop: normalize(8) }]}>
        <RatsText
          translate={false}
          text={`HOUSE CHORES (${choreList.length})`}
          style={{
            fontSize: fontSize.small,
            color: color.dark_grey,
            fontFamily: fontFamily.bold,
            letterSpacing: 0.8,
          }}
        />
      </View>

      {choreList.length === 0 ? (
        <View
          style={[
            INFO_CARD,
            { alignItems: 'center', paddingVertical: normalize(32) },
          ]}
          testID="chore-info-no-chores">
          <RatsText
            translate={false}
            text="No chores configured"
            style={{ fontSize: fontSize.medium, color: color.dark_grey }}
          />
          <RatsText
            translate={false}
            text="Add chores in House Settings"
            style={{
              fontSize: fontSize.regular,
              color: color.grey,
              marginTop: normalize(6),
            }}
          />
        </View>
      ) : (
        choreList.map((chore, index) => (
          <ChoreInfoItem
            key={chore.name}
            index={index}
            name={chore.name}
            description={chore.description}
            assignedTo={choreToGuest[chore.name]}
          />
        ))
      )}

      {/* Rotation order section */}
      <View style={[SECTION_HEADER, { marginTop: normalize(8) }]}>
        <RatsText
          translate={false}
          text={`ROTATION ORDER (${rotationGuests.length} RESIDENTS)`}
          style={{
            fontSize: fontSize.small,
            color: color.dark_grey,
            fontFamily: fontFamily.bold,
            letterSpacing: 0.8,
          }}
        />
      </View>

      {rotationGuests.length === 0 ? (
        <View
          style={[
            INFO_CARD,
            { alignItems: 'center', paddingVertical: normalize(24) },
          ]}
          testID="chore-info-no-residents">
          <RatsText
            translate={false}
            text="No residents in house"
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
        </View>
      ) : (
        rotationGuests.map((guest, index) => (
          <View
            key={guest.id}
            style={ROTATION_ITEM}
            testID={`rotation-row-${guest.id}`}>
            <View style={ROTATION_INDEX}>
              <RatsText
                translate={false}
                text={`${index + 1}`}
                style={{
                  color: color.cobalt,
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
                }}
              />
              {guest.currentChore ? (
                <RatsText
                  translate={false}
                  text={`Current: ${guest.currentChore}`}
                  style={{ fontSize: fontSize.small, color: color.baby_blue }}
                />
              ) : (
                <RatsText
                  translate={false}
                  text="No chore assigned"
                  style={{ fontSize: fontSize.small, color: color.grey }}
                />
              )}
            </View>
          </View>
        ))
      )}
    </RatsScrollView>
  );
};

export default HouseChoreInfo;
