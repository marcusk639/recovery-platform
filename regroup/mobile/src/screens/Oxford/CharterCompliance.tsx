import React from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, normalize, CARD_STYLE } from '../../styles/theme';
import { useOxfordGate } from '../../hooks/useOxfordGate';
import { useCharterCompliance } from '../../state/queries/charterComplianceQueries';
import CharterBadge from '../../components/oxford/CharterBadge';
import { ChartCondition } from '../../entities/oxford/CharterCompliance';
import { CHARTER_THRESHOLDS } from '../../entities/oxford';

const CONDITION_META = [
  {
    key: 'democratic' as const,
    title: 'Democratic Self-Governance',
    description: `Average voting participation across the past ${
      CHARTER_THRESHOLDS.recentVotesWindowDays
    } days must be ≥${Math.round(CHARTER_THRESHOLDS.democratic * 100)}%.`,
  },
  {
    key: 'financial' as const,
    title: 'Financial Self-Sufficiency',
    description: `EES collection rate must be ≥${Math.round(
      CHARTER_THRESHOLDS.financial * 100,
    )}% and the checking balance must be non-negative.`,
  },
  {
    key: 'zeroTolerance' as const,
    title: 'Zero Tolerance',
    description: `All positive or refused drug tests in the past ${CHARTER_THRESHOLDS.drugTestWindowDays} days must have a pending expulsion vote within ${CHARTER_THRESHOLDS.expulsionGraceDays} days.`,
  },
];

const CharterCompliance: React.FC = () => {
  const { allowed, houseId } = useOxfordGate();
  const { summary, isLoading, isError } = useCharterCompliance(
    houseId,
    allowed,
  );

  if (!allowed) {
    return (
      <View style={styles.container}>
        <ScreenHeader header="Charter Compliance" renderBackButton />
        <View style={styles.center}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={styles.emptyText}
            translate={false}
          />
        </View>
      </View>
    );
  }

  const renderConditionCard = (
    meta: (typeof CONDITION_META)[number],
    condition: ChartCondition,
  ) => (
    <View
      key={meta.key}
      style={styles.card}
      testID={`charter-card-${meta.key}`}>
      <View style={styles.cardHeader}>
        <RatsText
          text={meta.title}
          style={styles.cardTitle}
          translate={false}
        />
        <CharterBadge
          status={condition.status}
          testID={`charter-badge-${meta.key}`}
        />
      </View>
      <RatsText
        text={meta.description}
        style={styles.cardDescription}
        translate={false}
      />
      {condition.metric !== null && (
        <RatsText
          text={`Metric: ${Math.round(condition.metric * 100)}%`}
          style={styles.cardMetric}
          translate={false}
        />
      )}
      <RatsText
        text={condition.detail}
        style={styles.cardDetail}
        translate={false}
      />
    </View>
  );

  return (
    <View style={styles.container} testID="charter-compliance-screen">
      <ScreenHeader header="Charter Compliance" renderBackButton />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}>
        {isLoading && (
          <View style={styles.center} testID="charter-loading">
            <ActivityIndicator color={color.baby_blue} size="large" />
          </View>
        )}

        {isError && !isLoading && (
          <View style={styles.center} testID="charter-error">
            <RatsText
              text="Unable to load compliance data. Please try again."
              style={styles.emptyText}
              translate={false}
            />
          </View>
        )}

        {!isLoading && !isError && summary && (
          <>
            <View style={styles.overallCard} testID="charter-overall">
              <RatsText
                text="Overall Status"
                style={styles.overallLabel}
                translate={false}
              />
              <CharterBadge
                status={summary.overall}
                testID="charter-badge-overall"
              />
              <RatsText
                text={`Last computed: ${new Date(
                  summary.computedAt,
                ).toLocaleString()}`}
                style={styles.computedAt}
                translate={false}
              />
            </View>

            {CONDITION_META.map(meta =>
              renderConditionCard(meta, summary[meta.key]),
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: normalize(10),
    paddingBottom: normalize(30),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: normalize(20),
  },
  overallCard: {
    ...CARD_STYLE,
    marginBottom: normalize(10),
    borderRadius: 8,
    gap: normalize(8),
  },
  overallLabel: {
    fontSize: fontSize.medium,
    fontWeight: '600',
    color: color.dark_blue,
  },
  computedAt: {
    fontSize: fontSize.extraSmall,
    color: color.grey,
    marginTop: normalize(4),
  },
  card: {
    ...CARD_STYLE,
    marginBottom: normalize(10),
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: normalize(6),
  },
  cardTitle: {
    fontSize: fontSize.medium,
    fontWeight: '600',
    color: color.dark_blue,
    flex: 1,
    marginRight: normalize(8),
  },
  cardDescription: {
    fontSize: fontSize.small,
    color: color.grey,
    marginBottom: normalize(6),
    lineHeight: normalize(18),
  },
  cardMetric: {
    fontSize: fontSize.regular,
    fontWeight: '600',
    color: color.dark_blue,
    marginBottom: normalize(4),
  },
  cardDetail: {
    fontSize: fontSize.regular,
    color: color.black,
    lineHeight: normalize(20),
  },
  emptyText: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: 'center',
  },
});

export default CharterCompliance;
