import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { RatsIcon } from '../../components/rats-icon';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
import { RentPayment } from '../../services/payments';
import PaymentStatusBadge from './PaymentStatusBadge';
import { formatCentsAsCurrency, formatDate } from './rentPaymentHelpers';
import { shareReceipt, ReceiptData } from '../../services/receiptService';

export interface PaymentRowProps {
  payment: RentPayment;
  guestName?: string;
  houseName?: string;
}

const PaymentRow: React.FC<PaymentRowProps> = ({
  payment,
  guestName = 'Resident',
  houseName = '',
}) => {
  const handleShare = async () => {
    const receipt: ReceiptData = {
      paymentId: payment.id,
      guestName,
      houseName,
      amountInCents: payment.amount,
      method: payment.description?.includes('Manual')
        ? payment.description.replace('Manual Payment — ', '').split(':')[0]
        : 'Card',
      date: payment.createdAt,
      description: payment.description,
      status: payment.status,
    };
    try {
      await shareReceipt(receipt);
    } catch {
      Alert.alert('Error', 'Could not share receipt.');
    }
  };

  return (
    <View style={styles.paymentRow} testID="payment-history-row">
      <View style={{ flex: 1 }}>
        <RatsText
          translate={false}
          text={payment.description ?? 'Rent Payment'}
          style={styles.paymentDescription}
        />
        <RatsText
          translate={false}
          text={formatDate(payment.createdAt)}
          style={styles.paymentDate}
        />
      </View>
      <View style={styles.paymentRight}>
        <RatsText
          translate={false}
          text={formatCentsAsCurrency(payment.amount)}
          style={styles.paymentAmount}
        />
        <View style={styles.statusRow}>
          <PaymentStatusBadge status={payment.status} />
          {payment.status === 'succeeded' && (
            <TouchableOpacity
              testID="share-receipt-button"
              onPress={handleShare}
              style={styles.shareButton}>
              <RatsIcon name="share-alt" size={14} color={color.baby_blue} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  paymentDescription: {
    fontSize: fontSize.regular,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  paymentDate: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(6),
  },
  shareButton: {
    padding: normalize(4),
  },
});

export default PaymentRow;
