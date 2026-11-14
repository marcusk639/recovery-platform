import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
import { RentPayment } from '../../services/payments';

export interface PaymentStatusBadgeProps {
  status: RentPayment['status'];
  /** What a refund or dispute changed this to; `status` stays "succeeded" after one. */
  adjusted?: { label: string; color: string };
}

const STATUS_COLORS: Record<RentPayment['status'], string> = {
  succeeded: color.green,
  pending: color.yellow,
  failed: color.red,
  resolved_offline: color.green,
};

const STATUS_LABELS: Record<RentPayment['status'], string> = {
  succeeded: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  resolved_offline: 'Resolved',
};

const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status, adjusted }) => {
  const badgeColor = adjusted?.color ?? STATUS_COLORS[status];
  return (
    <View
      style={[styles.badge, { backgroundColor: badgeColor + '22', borderColor: badgeColor }]}
      testID={`payment-status-badge-${status}`}>
      <RatsText
        translate={false}
        text={adjusted?.label ?? STATUS_LABELS[status]}
        style={[styles.badgeText, { color: badgeColor }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: fontSize.extraSmall,
    fontFamily: fontFamily.bold,
  },
});

export default PaymentStatusBadge;
