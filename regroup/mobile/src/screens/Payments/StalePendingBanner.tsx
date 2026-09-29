import React from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { format } from 'date-fns';
import { RentPayment } from '../../services/payments';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';
import { toDateSafe } from '../../util/firestore';
import { logException } from '../../util/logging';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORT_MAILTO =
  'mailto:admin@regroup-app.com?subject=Stuck%20Pending%20Payment';

const AMBER_BG = '#FFF8E1';
const AMBER_ROW_BORDER = '#FFE082';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  stalePendingPayments: RentPayment[];
  guestNames: Record<string, string>;
}

interface RowProps {
  payment: RentPayment;
  guestName: string;
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const StalePendingRow: React.FC<RowProps> = ({ payment, guestName }) => {
  const date = toDateSafe(payment.createdAt);
  const dateStr = date ? format(date, 'MMM d') : '';

  return (
    <View style={styles.row} testID={`stale-pending-row-${payment.id}`}>
      <RatsText translate={false} text={guestName} style={styles.guestName} />
      <RatsText
        translate={false}
        text={`$${(payment.amount / 100).toFixed(2)} · ${
          payment.description ?? 'Rent'
        } · ${dateStr}`}
        style={styles.detail}
      />
    </View>
  );
};

// ─── Banner ───────────────────────────────────────────────────────────────────

const StalePendingBanner: React.FC<Props> = ({
  stalePendingPayments,
  guestNames,
}) => {
  if (stalePendingPayments.length === 0) return null;

  const count = stalePendingPayments.length;
  const headerText = `${count} Payment${count > 1 ? 's' : ''} Pending 24h+`;

  const handleContactSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_MAILTO);
    } catch (err) {
      logException(err);
    }
  };

  return (
    <View style={styles.banner} testID="stale-pending-banner">
      <RatsText translate={false} text={headerText} style={styles.header} />
      <RatsText
        translate={false}
        text="These payments have been pending for over 24 hours. This may indicate a missed Stripe webhook."
        style={styles.subtitle}
      />
      {stalePendingPayments.map(p => (
        <StalePendingRow
          key={p.id}
          payment={p}
          guestName={guestNames[p.guestId] ?? 'Unknown Resident'}
        />
      ))}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={handleContactSupport}
        testID="stale-pending-contact-support">
        <RatsText
          translate={false}
          text="Contact Support"
          style={styles.ctaText}
        />
      </TouchableOpacity>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    backgroundColor: AMBER_BG,
    borderLeftWidth: 4,
    borderLeftColor: color.yellow,
    borderRadius: 6,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    padding: normalize(12),
  },
  header: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  subtitle: {
    fontSize: fontSize.small,
    color: color.grey,
    marginBottom: normalize(8),
  },
  row: {
    paddingVertical: normalize(6),
    borderTopWidth: 1,
    borderTopColor: AMBER_ROW_BORDER,
  },
  guestName: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: color.dark_grey,
  },
  detail: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  ctaButton: {
    marginTop: normalize(10),
    alignSelf: 'flex-start',
    backgroundColor: color.yellow,
    borderRadius: 4,
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
  },
  ctaText: {
    fontSize: fontSize.small,
    color: color.white,
    fontWeight: '600',
  },
});

export default StalePendingBanner;
