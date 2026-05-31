//@ts-nocheck
import React, { useCallback } from 'react';
import { View, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import RatsLoadingIndicator from '../../../components/rats-loading-indicator/rats-loading-indicator';
import RatsScrollView from '../../../components/rats-scroll-view';
import { RatsText } from '../../../components/rats-text';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { houseKeys } from '../../../state/queries/houseQueries';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  fontFamily,
} from '../../../styles/theme.tsx';

// ─── Styles ───────────────────────────────────────────────────────────────────

const SECTION_HEADER: ViewStyle = {
  ...CARD_STYLE,
  paddingVertical: normalize(10),
  paddingHorizontal: normalize(16),
  marginBottom: 2,
  borderLeftWidth: 4,
  borderLeftColor: color.baby_blue,
};

const INFO_ROW: ViewStyle = {
  ...CARD_STYLE,
  marginBottom: 2,
  paddingVertical: normalize(14),
  paddingHorizontal: normalize(16),
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const BADGE: ViewStyle = {
  paddingHorizontal: normalize(10),
  paddingVertical: normalize(3),
  borderRadius: normalize(12),
  backgroundColor: color.light_blue,
  alignSelf: 'flex-start',
};

// ─── InfoRow ──────────────────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string;
  testID?: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, testID }) => (
  <View style={INFO_ROW} testID={testID}>
    <RatsText
      translate={false}
      text={label}
      style={{ fontSize: fontSize.regular, color: color.dark_grey, flex: 1 }}
    />
    <RatsText
      translate={false}
      text={value}
      style={{
        fontSize: fontSize.regular,
        color: color.black,
        fontFamily: fontFamily.bold,
        textAlign: 'right',
        flex: 1,
      }}
    />
  </View>
);

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title }) => (
  <View style={SECTION_HEADER}>
    <RatsText
      translate={false}
      text={title}
      style={{
        fontSize: fontSize.small,
        color: color.dark_grey,
        fontFamily: fontFamily.bold,
        letterSpacing: 0.8,
      }}
    />
  </View>
);

// ─── HouseInfo ────────────────────────────────────────────────────────────────

const HouseInfo: React.FC = () => {
  const { house, houseId } = useSelectedHouse();
  const queryClient = useQueryClient();

  // Refetch on focus so returning after an edit on another screen shows
  // fresh data instead of the RQ-cached pre-edit value (staleTime is 60s).
  useFocusEffect(
    useCallback(() => {
      if (houseId) {
        queryClient.invalidateQueries({ queryKey: houseKeys.detail(houseId) });
      }
    }, [houseId, queryClient]),
  );

  if (!house) {
    return <RatsLoadingIndicator />;
  }

  const addressParts = [
    house.street,
    house.city,
    house.state,
    house.zip,
    house.country,
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : 'Not set';

  const choreCount = house.chores ? Object.keys(house.chores).length : 0;
  const phaseCount = house.phases ? Object.keys(house.phases).length : 0;

  const rentDisplay = (() => {
    if (house.rentFrequency === 'monthly') {
      return house.monthlyRent ? `$${house.monthlyRent}/mo` : 'Not set';
    }
    if (house.rentFrequency === 'weekly') {
      return house.weeklyRent ? `$${house.weeklyRent}/wk` : 'Not set';
    }
    const parts = [];
    if (house.monthlyRent) parts.push(`$${house.monthlyRent}/mo`);
    if (house.weeklyRent) parts.push(`$${house.weeklyRent}/wk`);
    return parts.length > 0 ? parts.join('  |  ') : 'Not set';
  })();

  const houseTypeLabel =
    house.houseType === 'oxford' ? 'Oxford House' : 'Traditional';

  return (
    <RatsScrollView
      testID="house-info-scroll"
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: color.light_grey,
      }}>
      {/* House name banner */}
      <View
        style={[
          CARD_STYLE,
          {
            paddingVertical: normalize(20),
            paddingHorizontal: normalize(16),
            marginBottom: 2,
            backgroundColor: color.cobalt,
          },
        ]}
        testID="house-info-name-card">
        <RatsText
          translate={false}
          text={house.name || 'Unnamed House'}
          style={{
            fontSize: fontSize.large,
            color: color.white,
            fontFamily: fontFamily.bold,
          }}
        />
        <RatsText
          translate={false}
          text={address}
          style={{
            fontSize: fontSize.regular,
            color: color.light_blue,
            marginTop: normalize(4),
          }}
        />
      </View>

      {/* General section */}
      <View style={{ marginTop: normalize(8) }}>
        <SectionHeader title="GENERAL" />

        <InfoRow
          testID="house-info-type"
          label="House Type"
          value={houseTypeLabel}
        />

        {house.gender ? (
          <InfoRow
            testID="house-info-gender"
            label="Gender"
            value={house.gender.charAt(0).toUpperCase() + house.gender.slice(1)}
          />
        ) : null}

        <InfoRow
          testID="house-info-phone"
          label="Phone"
          value={house.phoneNumber || 'Not set'}
        />

        <InfoRow
          testID="house-info-wifi"
          label="WiFi"
          value={house.wifi ? 'Yes' : 'No'}
        />
      </View>

      {/* Capacity section */}
      <View style={{ marginTop: normalize(8) }}>
        <SectionHeader title="OCCUPANCY" />

        <InfoRow
          testID="house-info-capacity"
          label="Capacity"
          value={`${house.currentCapacity} / ${house.maximumCapacity}`}
        />
      </View>

      {/* Rent section */}
      <View style={{ marginTop: normalize(8) }}>
        <SectionHeader title="RENT" />

        <InfoRow testID="house-info-rent" label="Rent" value={rentDisplay} />
      </View>

      {/* House structure section */}
      <View style={{ marginTop: normalize(8) }}>
        <SectionHeader title="STRUCTURE" />

        <InfoRow
          testID="house-info-chores"
          label="Chores"
          value={`${choreCount}`}
        />

        <InfoRow
          testID="house-info-phases"
          label="Phases"
          value={`${phaseCount}`}
        />
      </View>

      {/* House code section */}
      <View style={{ marginTop: normalize(8) }}>
        <SectionHeader title="JOIN CODE" />

        <View
          style={[
            CARD_STYLE,
            {
              marginBottom: 2,
              paddingVertical: normalize(20),
              paddingHorizontal: normalize(16),
              alignItems: 'center',
            },
          ]}
          testID="house-info-code-card">
          <View style={BADGE}>
            <RatsText
              translate={false}
              text={house.code || '—'}
              style={{
                fontSize: fontSize.larger,
                color: color.cobalt,
                fontFamily: fontFamily.bold,
                letterSpacing: 4,
              }}
            />
          </View>
          <RatsText
            translate={false}
            text="Share this code so residents can join the house"
            style={{
              fontSize: fontSize.small,
              color: color.grey,
              marginTop: normalize(8),
              textAlign: 'center',
            }}
          />
        </View>
      </View>
    </RatsScrollView>
  );
};

export default HouseInfo;
