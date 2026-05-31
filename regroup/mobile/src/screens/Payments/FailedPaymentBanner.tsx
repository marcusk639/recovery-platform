// src/screens/Payments/FailedPaymentBanner.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { format } from 'date-fns';
import { RentPayment } from '../../services/payments';
import { useMarkPaymentResolved } from '../../state/queries/paymentQueries';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';
import { toDateSafe } from '../../util/firestore';

interface Props {
  failedPayments: RentPayment[];
  houseId: string;
  guestNames: Record<string, string>;
}

interface RowProps {
  payment: RentPayment;
  guestName: string;
  houseId: string;
}

const FailedPaymentRow: React.FC<RowProps> = ({
  payment,
  guestName,
  houseId,
}) => {
  const { mutateAsync, isPending } = useMarkPaymentResolved(houseId);

  const handleMarkResolved = async () => {
    try {
      await mutateAsync({ paymentId: payment.id });
    } catch {
      Alert.alert(
        'Error',
        'Could not mark payment resolved. Please try again.',
      );
    }
  };

  const date = toDateSafe(payment.createdAt);
  const dateStr = date ? format(date, 'MMM d') : '';

  return (
    <View style={styles.row} testID={`failed-payment-row-${payment.id}`}>
      <View style={styles.rowBody}>
        <RatsText translate={false} text={guestName} style={styles.guestName} />
        <RatsText
          translate={false}
          text={`$${(payment.amount / 100).toFixed(2)} · ${
            payment.description ?? 'Rent'
          } · ${dateStr}`}
          style={styles.detail}
        />
      </View>
      <TouchableOpacity
        style={[styles.resolveBtn, isPending && styles.btnDisabled]}
        onPress={handleMarkResolved}
        disabled={isPending}
        testID={`mark-resolved-${payment.id}`}>
        <RatsText
          translate={false}
          text="Mark Resolved"
          style={styles.resolveBtnText}
        />
      </TouchableOpacity>
    </View>
  );
};

const FailedPaymentBanner: React.FC<Props> = ({
  failedPayments,
  houseId,
  guestNames,
}) => {
  if (failedPayments.length === 0) return null;

  return (
    <View style={styles.banner} testID="failed-payment-banner">
      <RatsText
        translate={false}
        text={`${failedPayments.length} Failed Payment${
          failedPayments.length > 1 ? 's' : ''
        }`}
        style={styles.header}
      />
      {failedPayments.map(p => (
        <FailedPaymentRow
          key={p.id}
          payment={p}
          guestName={guestNames[p.guestId] ?? 'Unknown Resident'}
          houseId={houseId}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: color.red,
    borderRadius: 6,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    padding: normalize(12),
  },
  header: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(6),
    borderTopWidth: 1,
    borderTopColor: '#FDEEBA',
  },
  rowBody: { flex: 1 },
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
  resolveBtn: {
    backgroundColor: color.green,
    borderRadius: 4,
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(6),
    marginLeft: normalize(8),
  },
  btnDisabled: { opacity: 0.5 },
  resolveBtnText: {
    fontSize: fontSize.small,
    color: color.white,
    fontWeight: '600',
  },
});

export default FailedPaymentBanner;
