import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Share,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { toDateSafe } from '../../util/firestore';

import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';

import { useAppSelector } from '../../state/store';
import { listPayments, PaymentRecord } from '../../services/payments';
import { exportPaymentHistoryCSV } from '../../services/reportExport';
import { logException } from '../../util/logging';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';
import { RootStackParamList } from '../../navigation/types';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const PaymentHistory: React.FC<Props> = ({ navigation }) => {
  const guest = useAppSelector((s: any) => s.guests.selectedGuest);
  const house = useAppSelector((s: any) => s.houses.selectedHouse);

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleExportCSV = async () => {
    try {
      const guestId = guest?.id ?? 'unknown';
      const guestName =
        guest?.displayName ||
        `${guest?.firstName ?? ''} ${guest?.lastName ?? ''}`.trim() ||
        guestId;
      const guestNames: Record<string, string> = { [guestId]: guestName };
      const rentPayments = payments.map(p => ({
        ...p,
        guestId,
        houseId: house?.id ?? '',
      }));
      const csv = exportPaymentHistoryCSV(rentPayments, guestNames);
      await Share.share({ message: csv, title: 'Payment History Export' });
    } catch (err) {
      logException(err);
    }
  };

  useEffect(() => {
    const fetchPayments = async () => {
      if (!guest?.id || !house?.id) {
        setLoading(false);
        return;
      }
      try {
        const data = await listPayments(guest.id, house.id);
        setPayments(data);
      } catch (err: any) {
        logException(err);
        setError(err.message || 'Failed to load payment history.');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [guest?.id, house?.id]);

  const renderItem = useCallback(({ item }: { item: PaymentRecord }) => {
    const succeeded = item.status === 'succeeded';
    const createdMs = toDateSafe(item.createdAt)?.getTime();
    const isStale =
      item.status === 'pending' &&
      createdMs !== undefined &&
      createdMs < Date.now() - STALE_THRESHOLD_MS;

    return (
      <View
        testID={`payment-row-${item.id}`}
        style={[
          CARD_STYLE,
          styles.paymentCard,
          { borderLeftColor: succeeded ? color.green : color.red },
        ]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <RatsText
              translate={false}
              text={item.description}
              style={styles.description}
            />
            <RatsText
              translate={false}
              text={(() => {
                const d = toDateSafe(item.createdAt);
                return d ? format(d, 'MMM d, yyyy') : '—';
              })()}
              style={styles.date}
            />
          </View>
          <View style={styles.rightColumn}>
            <RatsText
              translate={false}
              text={`$${(item.amount / 100).toFixed(2)}`}
              style={styles.amount}
            />
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: succeeded ? color.green : color.red },
                ]}>
                <RatsText
                  translate={false}
                  text={item.status.toUpperCase()}
                  style={styles.statusText}
                />
              </View>
              {isStale && (
                <FontAwesome5
                  testID={`stale-clock-${item.id}`}
                  name="clock"
                  size={normalize(14)}
                  color={color.yellow}
                  style={styles.staleIcon}
                  accessible={true}
                  accessibilityLabel="Payment pending for more than 24 hours"
                  accessibilityRole="image"
                />
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }, []);

  if (loading) {
    return (
      <RatsScrollView>
        <ScreenHeader renderBackButton header="Payment History" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={color.main} />
        </View>
      </RatsScrollView>
    );
  }

  if (error) {
    return (
      <RatsScrollView>
        <ScreenHeader renderBackButton header="Payment History" />
        <View style={styles.centered}>
          <RatsText translate={false} text={error} style={styles.errorText} />
        </View>
      </RatsScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header="Payment History" />
      {payments.length === 0 ? (
        <View style={styles.centered}>
          <RatsText
            translate={false}
            text="No payments found."
            style={styles.emptyText}
          />
        </View>
      ) : (
        <>
          <RatsButton
            title="Export CSV"
            onPress={handleExportCSV}
            light
            containerStyle={styles.exportButton}
            testID="export-csv-button"
          />
          <FlatList
            data={payments}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            extraData={payments}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  listContent: {
    padding: normalize(10),
  },
  exportButton: {
    marginHorizontal: normalize(12),
    marginTop: normalize(8),
    marginBottom: normalize(4),
  },
  paymentCard: {
    marginBottom: normalize(8),
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: color.white,
    padding: normalize(12),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  description: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  date: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  statusBadge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: normalize(4),
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: normalize(4),
  },
  staleIcon: {
    marginLeft: normalize(6),
  },
  statusText: {
    fontSize: fontSize.extraSmall,
    color: color.white,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(20),
  },
  errorText: {
    color: color.red,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
  emptyText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
});

export default PaymentHistory;
