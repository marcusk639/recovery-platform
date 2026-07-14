/**
 * OxfordDashboard
 *
 * Main entry screen for the Oxford House vertical. Shows summary cards for
 * officers, upcoming meetings, and recent EES transactions. Only accessible
 * when house.houseType === 'oxford'.
 */

import React, { useMemo, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { RatsIcon } from "../../components/rats-icon";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenHeader from "../../components/screen-header";
import { RatsText } from "../../components/rats-text";
import { color, fontSize, normalize, CARD_STYLE } from "../../styles/theme";
import { useAppSelector } from "../../state/store";
import { Guest } from "../../entities/Guest";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import {
  useOfficers,
  useBusinessMeetings,
  useEESTransactions,
} from "../../state/queries/oxfordQueries";
import { useGuests } from "../../state/queries/guestQueries";
import { useCharterCompliance } from "../../state/queries/charterComplianceQueries";
import CharterBadge from "../../components/oxford/CharterBadge";
import { useCurrentWeekRecord } from "../../state/queries/treasuryQueries";
import { Routes, RootStackParamList } from "../../navigation/types";
import { Officer } from "../../entities/oxford/Officer";
import { BusinessMeeting } from "../../entities/oxford/BusinessMeeting";
import { EESTransaction } from "../../entities/oxford/EESTransaction";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const ROLE_LABELS: Record<string, string> = {
  president: "President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  comptroller: "Comptroller",
};

const OxfordDashboard: React.FC<Props> = ({ navigation }) => {
  const { house } = useSelectedHouse();
  const subscriptionMetadata = useAppSelector(
    (state) => state.user.user?.subscriptionMetadata,
  );

  const houseId = house?.id ?? "";
  // Source of truth for guests is React Query — the Redux state.guests.guests
  // slot is dead in production (cacheGuests is never dispatched).
  // See .full-review/01-quality-architecture.md [A2].
  const { data: guests = {} } = useGuests(houseId);

  const guestByUserId = useMemo(() => {
    const map: Record<string, Guest> = {};
    for (const g of Object.values(guests) as Guest[]) {
      if (g.userId) {
        map[g.userId] = g;
      }
    }
    return map;
  }, [guests]);

  const getGuestName = useCallback(
    (userId: string | undefined, fallbackName?: string): string => {
      const guest = userId ? guestByUserId[userId] : undefined;
      const guestName = guest
        ? `${guest.firstName || ""} ${guest.lastName || ""}`.trim()
        : "";
      // Officers created during onboarding (oxfordOnboardingMutations.ts)
      // have no userId and are never linked to a guest account — fall back
      // to the name captured at onboarding time before giving up.
      return guestName || fallbackName || "Unknown";
    },
    [guestByUserId],
  );

  const officersQuery = useOfficers(houseId, !!houseId);
  const meetingsQuery = useBusinessMeetings(houseId, !!houseId);
  const transactionsQuery = useEESTransactions(houseId, !!houseId);
  const { data: currentWeekRecord } = useCurrentWeekRecord(houseId, !!houseId);
  const { summary: charterSummary } = useCharterCompliance(houseId, !!houseId);

  // Memoize derived lists: each RQ refetch returns a new array reference,
  // so without useMemo these filter/slice chains re-run on every render
  // (including renders caused by the other two queries refetching).
  const activeOfficers = useMemo(
    () => (officersQuery.data ?? []).filter((o) => o.isActive).slice(0, 4),
    [officersQuery.data],
  );
  const upcomingMeetings = useMemo(
    () => (meetingsQuery.data ?? []).filter((m) => !m.actualDate).slice(0, 3),
    [meetingsQuery.data],
  );
  const recentTransactions = useMemo(
    () => (transactionsQuery.data ?? []).slice(0, 5),
    [transactionsQuery.data],
  );

  // Guard against firing before `house` arrives from Firestore: when house is
  // undefined, `!house?.oxfordOnboardingComplete` would be true and trigger a
  // premature redirect. Also require houseType === 'oxford' since that check
  // used to be implicit in the early return below.
  const shouldRedirectToOnboarding =
    !!house &&
    house.houseType === "oxford" &&
    !!subscriptionMetadata?.oxfordEnabled &&
    !house.oxfordOnboardingComplete;

  useEffect(() => {
    if (shouldRedirectToOnboarding) {
      navigation.navigate(Routes.OxfordOnboardingWizard);
    }
  }, [shouldRedirectToOnboarding, navigation]);

  if (!house || house.houseType !== "oxford") {
    return (
      <View style={styles.container}>
        <ScreenHeader header="Oxford House" renderBackButton />
        <View style={styles.emptyState}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={styles.emptyText}
            translate={false}
          />
        </View>
      </View>
    );
  }

  if (shouldRedirectToOnboarding) {
    return null;
  }

  if (!subscriptionMetadata?.oxfordEnabled) {
    return (
      <View style={styles.container} testID="oxford-upgrade-prompt">
        <ScreenHeader header="Oxford House" renderBackButton />
        <ScrollView contentContainerStyle={styles.upgradeScrollContent}>
          {/* Feature preview cards */}
          <View style={styles.upgradeHeader}>
            <RatsText
              text="Oxford House Management"
              style={styles.upgradeTitle}
              translate={false}
            />
            <RatsText
              text="Unlock governance tools built specifically for Oxford Houses"
              style={styles.upgradeSubtitle}
              translate={false}
            />
          </View>

          <View style={styles.featureCard}>
            <RatsText
              text="Officer Management"
              style={styles.featureTitle}
              translate={false}
            />
            <RatsText
              text="Track President, Treasurer, Secretary, and Comptroller elections and terms"
              style={styles.featureBody}
              translate={false}
            />
          </View>

          <View style={styles.featureCard}>
            <RatsText
              text="Business Meetings"
              style={styles.featureTitle}
              translate={false}
            />
            <RatsText
              text="Schedule meetings, set agendas, and record votes in one place"
              style={styles.featureBody}
              translate={false}
            />
          </View>

          <View style={styles.featureCard}>
            <RatsText
              text="EES Transaction Tracking"
              style={styles.featureTitle}
              translate={false}
            />
            <RatsText
              text="Record and review all house financial transactions"
              style={styles.featureBody}
              translate={false}
            />
          </View>

          <View style={styles.upgradeCtaContainer}>
            <RatsText
              text="Oxford Plan — $49/month"
              style={styles.upgradePriceLine}
              translate={false}
            />
            <RatsText
              text="Includes all Oxford House governance tools"
              style={styles.upgradePriceSubline}
              translate={false}
            />
            <TouchableOpacity
              testID="oxford-upgrade-button"
              onPress={() => navigation.navigate(Routes.SubscriptionHandler)}
              style={styles.upgradeButton}
            >
              <RatsText
                text="Start 14-Day Free Trial"
                style={styles.upgradeButtonText}
                translate={false}
              />
            </TouchableOpacity>
            <RatsText
              text="No payment required to start"
              style={styles.upgradeNote}
              translate={false}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const renderSummaryCard = (
    title: string,
    content: React.ReactNode,
    onPress: () => void,
    testID?: string,
  ) => (
    <TouchableOpacity
      testID={testID}
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <RatsText text={title} style={styles.cardTitle} translate={false} />
        <RatsText text="View All" style={styles.viewAll} translate={false} />
      </View>
      {content}
    </TouchableOpacity>
  );

  const renderOfficerContent = () => {
    if (officersQuery.isLoading) {
      return <ActivityIndicator color={color.baby_blue} size="small" />;
    }
    if (activeOfficers.length === 0) {
      return (
        <RatsText
          text="No officers assigned"
          style={styles.emptyCardText}
          translate={false}
        />
      );
    }
    return (
      <View>
        {activeOfficers.map((officer: Officer) => (
          <View key={officer.id} style={styles.listRow}>
            <View style={styles.roleBadge}>
              <RatsText
                text={ROLE_LABELS[officer.role] ?? officer.role}
                style={styles.roleBadgeText}
                translate={false}
              />
            </View>
            <RatsText
              text={getGuestName(officer.userId, officer.name)}
              style={styles.listRowText}
              translate={false}
            />
          </View>
        ))}
      </View>
    );
  };

  const renderMeetingsContent = () => {
    if (meetingsQuery.isLoading) {
      return <ActivityIndicator color={color.baby_blue} size="small" />;
    }
    if (upcomingMeetings.length === 0) {
      return (
        <RatsText
          text="No upcoming meetings scheduled"
          style={styles.emptyCardText}
          translate={false}
        />
      );
    }
    return (
      <View>
        {upcomingMeetings.map((meeting: BusinessMeeting) => (
          <View key={meeting.id} style={styles.listRow}>
            <RatsText
              text={new Date(meeting.scheduledDate).toLocaleDateString()}
              style={styles.listRowText}
              translate={false}
            />
            <RatsText
              text={`${meeting.agenda.length} item${
                meeting.agenda.length !== 1 ? "s" : ""
              }`}
              style={styles.listRowSubtext}
              translate={false}
            />
          </View>
        ))}
      </View>
    );
  };

  const renderTransactionsContent = () => {
    if (transactionsQuery.isLoading) {
      return <ActivityIndicator color={color.baby_blue} size="small" />;
    }
    if (recentTransactions.length === 0) {
      return (
        <RatsText
          text="No recent transactions"
          style={styles.emptyCardText}
          translate={false}
        />
      );
    }
    return (
      <View>
        {recentTransactions.map((tx: EESTransaction) => {
          // Defensive fallback for any pre-hardening records written before
          // 2026-07-05 that never set `type` — see ees.ts createEESRecords.
          const txType = tx.type ?? "payment";
          return (
            <View key={tx.id} style={styles.listRow}>
              <RatsText
                text={`$${tx.amount.toFixed(2)}`}
                style={[
                  styles.listRowText,
                  {
                    color: txType === "refund" ? color.green : color.dark_blue,
                  },
                ]}
                translate={false}
              />
              <RatsText
                text={txType.charAt(0).toUpperCase() + txType.slice(1)}
                style={styles.listRowSubtext}
                translate={false}
              />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container} testID="oxford-dashboard-content">
      <ScreenHeader
        header="Oxford House"
        renderBackButton
        container={{ marginBottom: 2 }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Charter Compliance Summary */}
        <TouchableOpacity
          testID="oxford-charter-card"
          style={styles.card}
          onPress={() => navigation.navigate(Routes.CharterCompliance)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <RatsText
              text="Charter Compliance"
              style={styles.cardTitle}
              translate={false}
            />
            {charterSummary ? (
              <CharterBadge status={charterSummary.overall} />
            ) : (
              <RatsText text="View" style={styles.viewAll} translate={false} />
            )}
          </View>
          <RatsText
            text="Democratic governance · Financial health · Zero tolerance"
            style={styles.emptyCardText}
            translate={false}
          />
        </TouchableOpacity>

        {/* Officers Summary */}
        {renderSummaryCard(
          "Current Officers",
          renderOfficerContent(),
          () => navigation.navigate(Routes.OfficerManagement),
          "oxford-officers-card",
        )}

        {/* Treasury Summary */}
        <TouchableOpacity
          testID="oxford-treasury-card"
          style={styles.card}
          onPress={() => navigation.navigate(Routes.TreasuryDashboard)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <RatsIcon
                name="file-invoice-dollar"
                size={20}
                color={color.baby_blue}
              />
              <RatsText
                translate={false}
                text="Treasury"
                style={styles.cardTitle}
              />
            </View>
            <RatsText
              text="View All"
              style={styles.viewAll}
              translate={false}
            />
          </View>
          <RatsText
            translate={false}
            text={
              currentWeekRecord
                ? `Balance: $${(
                    currentWeekRecord.endingCheckingBalance / 100
                  ).toFixed(2)} — ${currentWeekRecord.status}`
                : "No report this week"
            }
            style={styles.emptyCardText}
          />
        </TouchableOpacity>

        {/* Upcoming Meetings Summary */}
        {renderSummaryCard(
          "Upcoming Meetings",
          renderMeetingsContent(),
          () => navigation.navigate(Routes.BusinessMeetings),
          "oxford-meetings-card",
        )}

        {/* Recent EES Transactions */}
        {renderSummaryCard(
          "Recent EES Transactions",
          renderTransactionsContent(),
          () => navigation.navigate(Routes.EESTracker),
          "oxford-transactions-card",
        )}

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity
            testID="oxford-elections-link"
            style={styles.quickLinkButton}
            onPress={() => navigation.navigate(Routes.OxfordVoting)}
          >
            <RatsText
              text="Elections"
              style={styles.quickLinkText}
              translate={false}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: normalize(10),
    paddingBottom: normalize(30),
  },
  card: {
    ...CARD_STYLE,
    marginBottom: normalize(10),
    borderRadius: 8,
    shadowColor: color.grey,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { height: 2, width: 0 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: normalize(8),
    paddingBottom: normalize(8),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  cardTitle: {
    fontSize: fontSize.medium,
    fontWeight: "600",
    color: color.dark_blue,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: normalize(6),
  },
  viewAll: {
    fontSize: fontSize.small,
    color: color.baby_blue,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: normalize(4),
  },
  listRowText: {
    fontSize: fontSize.regular,
    color: color.black,
    flex: 1,
  },
  listRowSubtext: {
    fontSize: fontSize.small,
    color: color.grey,
    marginLeft: normalize(8),
  },
  roleBadge: {
    backgroundColor: color.light_blue,
    borderRadius: 4,
    paddingHorizontal: normalize(6),
    paddingVertical: normalize(2),
    marginRight: normalize(8),
  },
  roleBadgeText: {
    fontSize: fontSize.extraSmall,
    color: color.dark_blue,
    fontWeight: "600",
  },
  emptyCardText: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: "center",
    paddingVertical: normalize(8),
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: normalize(20),
  },
  emptyText: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: "center",
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: normalize(8),
    marginTop: normalize(4),
  },
  quickLinkButton: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.baby_blue,
    borderRadius: 8,
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(10),
  },
  quickLinkText: {
    fontSize: fontSize.regular,
    color: color.baby_blue,
  },
  upgradeScrollContent: {
    padding: normalize(16),
    paddingBottom: normalize(40),
  },
  upgradeHeader: {
    alignItems: "center",
    marginBottom: normalize(24),
    paddingTop: normalize(8),
  },
  upgradeTitle: {
    fontSize: fontSize.large,
    fontWeight: "700",
    color: color.dark_blue,
    textAlign: "center",
    marginBottom: normalize(8),
  },
  upgradeSubtitle: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: "center",
  },
  featureCard: {
    backgroundColor: color.white,
    borderRadius: 8,
    padding: normalize(16),
    marginBottom: normalize(12),
    borderLeftWidth: 4,
    borderLeftColor: color.baby_blue,
  },
  featureTitle: {
    fontSize: fontSize.medium,
    fontWeight: "600",
    color: color.dark_blue,
    marginBottom: normalize(6),
  },
  featureBody: {
    fontSize: fontSize.regular,
    color: color.grey,
    lineHeight: normalize(20),
  },
  upgradeCtaContainer: {
    alignItems: "center",
    marginTop: normalize(24),
    padding: normalize(20),
    backgroundColor: color.white,
    borderRadius: 12,
  },
  upgradePriceLine: {
    fontSize: fontSize.large,
    fontWeight: "700",
    color: color.dark_blue,
    marginBottom: normalize(4),
  },
  upgradePriceSubline: {
    fontSize: fontSize.regular,
    color: color.grey,
    marginBottom: normalize(20),
  },
  upgradeButton: {
    backgroundColor: color.baby_blue,
    borderRadius: 8,
    paddingVertical: normalize(14),
    paddingHorizontal: normalize(32),
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: normalize(12),
  },
  upgradeButtonText: {
    color: color.white,
    fontSize: fontSize.medium,
    fontWeight: "700",
  },
  upgradeNote: {
    fontSize: fontSize.small,
    color: color.grey,
  },
});

export default OxfordDashboard;
