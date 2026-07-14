import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, startOfISOWeek, parseISO } from "date-fns";
import { RootStackParamList } from "../../navigation/types";

import RatsScrollView from "../../components/rats-scroll-view";
import ScreenHeader from "../../components/screen-header";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsText } from "../../components/rats-text";

import { useOxfordGate } from "../../hooks/useOxfordGate";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { useGuests } from "../../state/queries/guestQueries";
import { Guest } from "../../entities/Guest";
import { EESRecord, calculateEES } from "../../services/oxford/ees";
import {
  useEESRecords,
  useMarkEESPaid,
  useCreateEESRecords,
} from "../../state/queries/oxfordQueries";
import { color, normalize, fontSize, CARD_STYLE } from "../../styles/theme";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

type EESRecordWithId = EESRecord & { id: string };

const EESTracker: React.FC<Props> = ({ navigation }) => {
  const { allowed, houseId } = useOxfordGate();
  // house is still needed for currentCapacity — the gate already ensures
  // the selection is an Oxford house.
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(houseId, allowed);

  const weekStart = format(startOfISOWeek(new Date()), "yyyy-MM-dd");

  const [totalExpenses, setTotalExpenses] = useState(0);

  const {
    data: records = [],
    isLoading: loading,
    isFetching,
    refetch,
  } = useEESRecords(houseId, weekStart, allowed);

  const markPaidMutation = useMarkEESPaid();
  const createRecordsMutation = useCreateEESRecords();

  // Resident count — NOT house.currentCapacity (bed capacity). The preview
  // amount shown here must match what handleCreateRecords actually bills,
  // which divides by the number of residents currently in the house, not
  // how many beds theoretically exist. See regroup Bug 1 fix (2026-07-14).
  const guestList = useMemo(() => Object.values(guests) as Guest[], [guests]);
  const residentCount = guestList.length;
  const eesAmount = calculateEES(totalExpenses, residentCount);
  const bedCapacity = house?.currentCapacity ?? 0;
  const capacityMismatch = bedCapacity > 0 && residentCount > bedCapacity;

  const handleMarkPaid = useCallback(
    async (record: EESRecordWithId) => {
      if (record.paid) {
        return;
      }
      try {
        await markPaidMutation.mutateAsync({
          recordId: record.id,
          houseId,
          weekStart,
        });
      } catch {
        // onError already routes to Sentry via the mutation hook.
        Alert.alert("Error", "Failed to mark as paid. Please try again.");
      }
    },
    [markPaidMutation, houseId, weekStart],
  );

  const handleCreateRecords = async () => {
    if (!houseId) {
      return;
    }
    if (guestList.length === 0) {
      Alert.alert(
        "No Residents",
        "No residents found to create EES records for.",
      );
      return;
    }

    try {
      const amount = calculateEES(totalExpenses, guestList.length);
      await createRecordsMutation.mutateAsync({
        houseId,
        weekStart,
        guestIds: guestList.map((g) => g.id),
        amountPerGuest: amount,
      });
    } catch {
      Alert.alert("Error", "Failed to create EES records. Please try again.");
    }
  };

  const getGuestName = useCallback(
    (guestId: string): string => {
      const guest = guests[guestId] as Guest | undefined;
      if (!guest) {
        return "Unknown Resident";
      }
      return (
        `${guest.firstName || ""} ${guest.lastName || ""}`.trim() ||
        "Unknown Resident"
      );
    },
    [guests],
  );

  // Single pass for paid/unpaid counts (avoids two .filter() scans on every
  // render over the same array).
  const { paidCount, unpaidCount } = useMemo(() => {
    let paid = 0;
    for (const r of records) {
      if (r.paid) paid++;
    }
    return { paidCount: paid, unpaidCount: records.length - paid };
  }, [records]);

  const renderRecord = useCallback(
    ({ item }: { item: EESRecordWithId }) => (
      <TouchableOpacity
        onPress={() => handleMarkPaid(item)}
        style={[
          CARD_STYLE,
          {
            marginBottom: normalize(8),
            backgroundColor: color.white,
            borderLeftWidth: 4,
            borderLeftColor: item.paid ? color.green : color.red,
            padding: normalize(12),
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        ]}
      >
        <View>
          <RatsText
            text={getGuestName(item.guestId)}
            style={{ fontSize: fontSize.medium, color: color.black }}
          />
          <RatsText
            text={`$${item.amount.toFixed(2)}`}
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
          {item.paidAt && (
            <RatsText
              text={`Paid: ${format(parseISO(item.paidAt!), "MMM d, yyyy")}`}
              style={{ fontSize: fontSize.small, color: color.grey }}
            />
          )}
        </View>
        <View
          style={{
            backgroundColor: item.paid ? color.green : color.red,
            paddingHorizontal: normalize(10),
            paddingVertical: normalize(4),
            borderRadius: normalize(4),
          }}
        >
          <RatsText
            text={item.paid ? "PAID" : "UNPAID"}
            style={{ color: color.white, fontSize: fontSize.small }}
          />
        </View>
      </TouchableOpacity>
    ),
    [handleMarkPaid, getGuestName],
  );

  if (!allowed) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Equal Expense Share" renderBackButton />
        <View style={{ padding: normalize(24), alignItems: "center" }}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={{ color: color.dark_grey, fontSize: fontSize.regular }}
            translate={false}
          />
        </View>
      </RatsScrollView>
    );
  }

  if (loading) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Equal Expense Share" renderBackButton />
        <ActivityIndicator
          color={color.baby_blue}
          style={{ marginTop: normalize(40) }}
        />
      </RatsScrollView>
    );
  }

  return (
    <RatsScrollView
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !loading}
          onRefresh={refetch}
        />
      }
    >
      <ScreenHeader header="Equal Expense Share" />
      <View style={{ padding: normalize(16) }}>
        {/* Summary Card */}
        <View
          style={[
            CARD_STYLE,
            {
              backgroundColor: color.baby_blue,
              padding: normalize(16),
              marginBottom: normalize(16),
            },
          ]}
        >
          <RatsText
            text={`Week of ${format(parseISO(weekStart), "MMM d, yyyy")}`}
            style={{
              color: color.white,
              fontSize: fontSize.small,
              marginBottom: normalize(4),
            }}
          />
          <RatsText
            text={`EES Amount: $${eesAmount.toFixed(2)}`}
            style={{ color: color.white, fontSize: fontSize.large }}
          />
          <RatsText
            text={`${residentCount} residents | ${paidCount} paid, ${unpaidCount} unpaid`}
            style={{
              color: color.white,
              fontSize: fontSize.regular,
              marginTop: normalize(4),
            }}
          />
          {capacityMismatch && (
            <RatsText
              text={`Warning: resident count (${residentCount}) exceeds bed capacity (${bedCapacity}). Check house data.`}
              style={{
                color: color.red,
                fontSize: fontSize.small,
                marginTop: normalize(4),
              }}
            />
          )}
        </View>

        {records.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: normalize(24) }}>
            <RatsText
              text="No EES records for this week."
              style={{
                color: color.dark_grey,
                fontSize: fontSize.regular,
                marginBottom: normalize(16),
              }}
            />
            <RatsButton
              title="Generate EES Records"
              onPress={handleCreateRecords}
            />
          </View>
        ) : (
          <>
            <RatsText
              text="Tap a record to mark as paid"
              style={{
                color: color.grey,
                fontSize: fontSize.small,
                marginBottom: normalize(8),
              }}
            />
            <FlatList
              data={records}
              keyExtractor={(item) => item.id}
              renderItem={renderRecord}
              scrollEnabled={false}
            />
          </>
        )}
      </View>
    </RatsScrollView>
  );
};

export default EESTracker;
