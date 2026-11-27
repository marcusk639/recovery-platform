import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import type { RentCharge } from '../../services/rentCharges';
import { CARD_STYLE, color, fontFamily, fontSize, normalize } from '../../styles/theme';
import { formatCents } from '../../util/money';
import { chargeDetail, chargeLabel } from '../../util/paymentDisplay';

/** One rent charge in Payment History: what raised the balance, for which days. */
const ChargeRow: React.FC<{ charge: RentCharge }> = ({ charge }) => {
  const detail = chargeDetail(charge);
  return (
    <View testID={`charge-row-${charge.id}`} style={[CARD_STYLE, styles.card]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <RatsText translate={false} text={chargeLabel(charge)} style={styles.title} />
          {detail ? <RatsText translate={false} text={detail} style={styles.detail} /> : null}
        </View>
        <View style={styles.right}>
          <RatsText
            translate={false}
            text={formatCents(charge.amountCents)}
            style={styles.amount}
          />
          <RatsText translate={false} text="RENT CHARGE" style={styles.detail} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: normalize(8),
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: color.dark_grey,
    backgroundColor: color.white,
    padding: normalize(12),
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: fontSize.medium, color: color.black, fontFamily: fontFamily.bold },
  detail: { fontSize: fontSize.small, color: color.grey, marginTop: normalize(2) },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: fontSize.medium, color: color.black, fontFamily: fontFamily.bold },
});

export default ChargeRow;
