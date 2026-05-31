import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
import { RentPayment } from '../../services/payments';

export interface PaymentStatusBadgeProps {
  status: RentPayment['status'];
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

const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status }) => (
  <View
    style={[
      styles.badge,
      {
        backgroundColor: STATUS_COLORS[status] + '22',
        borderColor: STATUS_COLORS[status],
      },
    ]}
    testID={`payment-status-badge-${status}`}>
    <RatsText
      translate={false}
      text={STATUS_LABELS[status]}
      style={[styles.badgeText, { color: STATUS_COLORS[status] }]}
    />
  </View>
);

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
