import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { RentPreviewRow } from '../../services/rentCharges';
import { color, fontSize, normalize } from '../../styles/theme';
import { asCents, formatCents } from '../../util/money';
import { formatRentDay, StaleCustomRate } from './rentSettingsHelpers';

/** "$0.00 now · first charge $125.00 on Wed, Nov 25 (5 of 7 days)"; a full period has no days. */
export function previewLine(r: RentPreviewRow): string {
  const prorated =
    r.daysCovered < r.daysInPeriod ? ` (${r.daysCovered} of ${r.daysInPeriod} days)` : '';
  return `${formatCents(r.nowCents)} now · first charge ${formatCents(r.amountCents)} on ${formatRentDay(r.firstDay)}${prorated}`;
}

interface Props {
  residents: RentPreviewRow[];
  /** Residents the server can't charge: their own rate is above the limit. */
  skipped?: number;
  stale: StaleCustomRate[];
  schedule: 'weekly' | 'monthly';
}

/** What saving would charge each current resident, and whose own rate won't apply. */
const RentPreviewList: React.FC<Props> = ({ residents, skipped = 0, stale, schedule }) => (
  <View testID="rent-preview-list">
    <RatsText translate={false} text="What residents will be charged" style={styles.title} />
    {residents.length === 0 ? (
      <RatsText translate={false} text="No current residents." style={styles.detail} />
    ) : (
      residents.map((r) => (
        <View key={r.guestId} style={styles.row} testID={`rent-preview-row-${r.guestId}`}>
          <RatsText translate={false} text={r.label} style={styles.name} />
          <RatsText translate={false} text={previewLine(r)} style={styles.detail} />
          {r.rateSource === 'custom' ? (
            <RatsText translate={false} text="Their own rate" style={styles.detail} />
          ) : null}
        </View>
      ))
    )}
    {skipped > 0 ? (
      <View style={styles.stale} testID="rent-preview-skipped">
        <RatsText
          translate={false}
          text={`${skipped} ${skipped === 1 ? 'resident has' : 'residents have'} an own rate above the limit and won't be charged until it is set again.`}
          style={styles.detail}
        />
      </View>
    ) : null}
    {stale.length > 0 ? (
      <View style={styles.stale} testID="rent-stale-custom-rates">
        <RatsText
          translate={false}
          text={`These residents' own rates are ${schedule === 'weekly' ? 'monthly' : 'weekly'} and won't be used while rent is ${schedule}. Set them again on each resident's profile:`}
          style={styles.detail}
        />
        {stale.map((s) => (
          <RatsText
            key={s.guestId}
            translate={false}
            text={`${s.label}: ${formatCents(asCents(s.amountCents))} a ${s.frequency === 'weekly' ? 'week' : 'month'}`}
            style={styles.name}
          />
        ))}
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  title: { fontSize: fontSize.medium, marginVertical: normalize(8) },
  row: {
    backgroundColor: color.white,
    borderRadius: 6,
    padding: normalize(10),
    marginBottom: normalize(6),
  },
  name: { fontSize: fontSize.regular_medium, color: color.black },
  detail: { fontSize: fontSize.regular, color: color.dark_grey },
  stale: {
    backgroundColor: color.light_red,
    borderRadius: 6,
    padding: normalize(10),
    marginTop: normalize(8),
  },
});

export default RentPreviewList;
