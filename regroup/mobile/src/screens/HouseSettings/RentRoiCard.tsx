import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { useRentRoiMetrics } from '../../state/queries/rentRoiQueries';
import { color, fontSize, normalize } from '../../styles/theme';

interface Props {
  houseId: string;
  /** Period start as an ISO instant; undefined means all time. */
  startAt?: string;
}

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Stat = ({ label, value, testID }: { label: string; value: string; testID: string }) => (
  <View style={styles.stat} testID={testID}>
    <RatsText translate={false} text={value} style={styles.value} />
    <RatsText translate={false} text={label} style={styles.label} />
  </View>
);

/**
 * Rent-collection ROI on the Payment Dashboard (#32): collected, on-time rate,
 * outstanding and the hours-saved estimate for the dashboard's period. Shows
 * nothing while loading, when the plan lacks analytics, or for staff other than
 * the owner, whom the server refuses.
 */
const RentRoiCard: React.FC<Props> = ({ houseId, startAt }) => {
  const { data, error } = useRentRoiMetrics(houseId, startAt);
  if (error) {
    const code = String((error as { code?: string }).code ?? '');
    if (code.includes('permission-denied')) return null;
    return (
      <View style={styles.card} testID="rent-roi-error">
        <RatsText
          translate={false}
          text="Couldn't load rent collection ROI."
          style={styles.label}
        />
      </View>
    );
  }
  if (!data || !data.available) return null;

  return (
    <View style={styles.card} testID="rent-roi-card">
      <RatsText translate={false} text="Rent collection ROI" style={styles.title} />
      <View style={styles.row}>
        <Stat
          label="Collected"
          value={dollars(data.collectedNetCents)}
          testID="rent-roi-collected"
        />
        <Stat
          label="On time"
          value={data.onTimeRatePct === null ? '—' : `${data.onTimeRatePct}%`}
          testID="rent-roi-on-time"
        />
      </View>
      <View style={styles.row}>
        <Stat
          label="Outstanding"
          value={dollars(data.outstandingCents)}
          testID="rent-roi-outstanding"
        />
        <Stat
          label="Hours saved (est.)"
          value={`${data.hoursSavedEstimate}`}
          testID="rent-roi-hours"
        />
      </View>
      <RatsText
        translate={false}
        testID="rent-roi-estimate-note"
        text={`Hours saved is an estimate: ${data.minutesSavedPerCollection} minutes for each payment collected through Stripe (${data.automatedCollectionCount} in this period).`}
        style={styles.note}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: 8,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    padding: normalize(12),
  },
  title: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  row: { flexDirection: 'row', marginBottom: normalize(8) },
  stat: { flex: 1 },
  value: { fontSize: fontSize.medium_large, fontWeight: '700', color: color.black },
  label: { fontSize: fontSize.small, color: color.grey },
  note: { fontSize: fontSize.small, color: color.grey, marginTop: normalize(4) },
});

export default RentRoiCard;
