/**
 * GuestHome - Main guest profile/overview screen
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, Share, Alert } from 'react-native';

// Hooks
import { useGuest, useGuests } from '../../state/queries';
import { useAppSelector } from '../../state/store';
import { useModal } from '../../context';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useCurrentWeek } from '../../hooks/activity/useCurrentWeek';
import {
  useComplianceCheck,
  useWeekSummary,
} from '../../state/queries/activityQueries';

// Components
import RatsScrollView from '../../components/rats-scroll-view';
import { RatsText } from '../../components/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon, ClickableIcon } from '../../components/rats-icon';
import WeekStatSummary from '../../components/week-stat-summary';
import BoxedIcon from '../../components/rats-icon/boxed-icon';
import EmptyScreen from '../../components/empty-screen';
import { ComplianceBreakdown } from '../../components/compliance-indicator';
import PhaseAdvancementBanner from '../../components/phase-advancement-banner/PhaseAdvancementBanner';

// Types & Entities
import { Guest, Stat } from '../../entities/Guest';
import { ActivityType } from '../../entities/ActivityModel';
import { House, StripeAccountStatus } from '../../entities/House';
import { formatCurrency } from '../RentPayment/rentPaymentHelpers';
import { User } from '../../entities/User';
import { Guests } from '../../types';
import { Health } from '../../constants/health';

// Utils
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  ROW,
  fontFamily,
} from '../../styles/theme';
import {
  getPhaseRule,
  HEALTH_COLOR_MAP,
  getHealthByPercentage,
  getPercentage,
  HEALTH_ICON_MAP,
  HEALTH_STATUS_MAP,
} from '../../util/guest';
import { getTodaysDate, STAT_MAP } from '../../util/display';
import { STAT_ROUTE } from '../../constants/routes';

// Navigation
import { Routes, RootStackParamList } from '../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Auth context for admin checks
import { AuthConsumer } from '../../context/auth';
import { isAdmin } from '../../util/roles';

// Report export
import { exportWeeklyReportPDF } from '../../services/reportExport';

// Discharge modal
import DischargeGuestModal from './DischargeGuestModal';

// Notifications
import { scheduleRentReminder } from '../../services/notifications/rentReminder';

// Styles
import styles from './ProfileStyles';

interface StatSectionProps {
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  boxedIconName: string;
  iconBackgroundColor: string;
  buttonText?: string;
  onPress?: null | (() => void);
  locked?: boolean;
  testID?: string;
}

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * StatSection - Reusable component for displaying stat cards
 */
const StatSection: React.FC<StatSectionProps> = ({
  name,
  description,
  iconName = '',
  iconColor = '',
  boxedIconName,
  iconBackgroundColor,
  buttonText = '',
  onPress = null,
  locked = false,
  testID,
}) => {
  return (
    <View style={[CARD_STYLE, { marginBottom: 1 }]}>
      <TouchableOpacity
        testID={testID}
        onPress={onPress ? onPress : () => {}}
        activeOpacity={onPress ? 0.2 : 1}
        style={ROW}>
        <View style={{ justifyContent: 'center', marginRight: normalize(10) }}>
          <BoxedIcon
            name={boxedIconName}
            backgroundColor={iconBackgroundColor}
          />
        </View>
        <View style={{ justifyContent: 'center' }}>
          <RatsText
            translate={false}
            text={name}
            style={{
              fontSize: fontSize.medium,
              color: color.black,
              fontFamily: fontFamily.bold,
            }}
          />
          <RatsText
            translate={false}
            text={description}
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
        </View>
        {iconName && (
          <RatsIcon
            name={iconName}
            solid
            size={normalize(20)}
            style={{ color: iconColor, marginLeft: 'auto' }}
          />
        )}
        {locked && (
          <RatsIcon
            name="lock"
            solid
            size={normalize(25)}
            style={{
              alignSelf: 'center',
              color: color.dark_grey,
              marginLeft: 'auto',
            }}
          />
        )}
      </TouchableOpacity>
    </View>
  );
};

/**
 * HealthDescription - Displays a health status row
 */
const HealthDescription: React.FC<{ health: Health }> = ({ health }) => {
  return (
    <View style={{ ...ROW, alignItems: 'center' }}>
      <RatsIcon
        name={HEALTH_ICON_MAP[health]}
        solid
        size={normalize(15)}
        style={{ color: color.dark_grey, marginRight: normalize(20) }}
      />
      <RatsText
        text={HEALTH_STATUS_MAP[health]}
        style={{ fontSize: fontSize.regular, color: color.dark_grey }}
      />
    </View>
  );
};

/**
 * GuestHome Component - Main guest profile/overview screen
 *
 * Shows:
 * - Overall health score
 * - Meeting stats
 * - Work hours stats
 * - Chore completion stats
 * - Primary supporter stats
 */
const GuestHome: React.FC<Props> = ({ navigation }) => {
  // Context hooks
  const { showFormModal } = useModal();

  // Local state for PDF export
  const [exportingPDF, setExportingPDF] = useState(false);

  // Local state for discharge modal
  const [showDischargeModal, setShowDischargeModal] = useState(false);

  // Get data + loading flags from the RQ-backed selection hooks. The old
  // state.guests.status / state.houses.requestingHouse flags were removed
  // in Phase C and never get written now — read isLoading from the hooks
  // instead.
  const { guest: selectedGuestRaw, isLoading: requestingGuests } =
    useSelectedGuest();
  const guest = selectedGuestRaw as Guest | null;
  const { house: selectedHouseRaw, isLoading: requestingHouse } =
    useSelectedHouse();
  const house = selectedHouseRaw as House | null;
  const user = useAppSelector((state: any) => state.user.user) as User | null;

  // Optionally fetch guest via React Query so we always have the freshest
  // server copy for read-through scenarios.
  const { data: queryGuest } = useGuest(guest?.id || '', !!guest?.id);

  // Use the most up-to-date guest data
  const currentGuest = queryGuest || guest;

  // Activity system: pre-fetch week summary (hooks must be called before early returns).
  // React Query is the sole source of truth — the prior `hooks/activity/useWeekSummary`
  // listener fired alongside useComplianceCheck below (which also calls the RQ
  // useWeekSummary internally), doubling reads on every profile mount and
  // letting the two state stores diverge. See .full-review [P2].
  const { startDate } = useCurrentWeek();
  const { data: summary = null } = useWeekSummary(
    currentGuest?.id ?? '',
    startDate,
    !!currentGuest?.id && !!startDate,
  );

  // Schedule a rent reminder for guests with an outstanding balance.
  // Deps are stable primitives so we avoid a stale-closure over currentGuest.
  const _guestId = currentGuest?.id;
  const _rentOwed = currentGuest?.rentOwed ?? 0;
  React.useEffect(() => {
    if (currentGuest && _rentOwed > 0) {
      scheduleRentReminder(currentGuest as Guest);
    }
  }, [_guestId, _rentOwed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compliance check for this week (hooks must be called before early returns)
  // We pass an empty-shell guest/house when they are not yet loaded so the hook
  // is always called unconditionally; the `enabled` flag keeps it dormant.
  const complianceEnabled = !!currentGuest && !!house;
  const { data: complianceResult, status: complianceStatus } =
    useComplianceCheck(
      currentGuest || ({ id: '', phase: '' } as any),
      startDate,
      house || ({ id: '', phases: {} } as any),
      complianceEnabled,
    );

  // Resolve the guest's phase rules (needed by ComplianceBreakdown to know which rows to show)
  const phaseRules =
    currentGuest && house
      ? house.phases?.[String(currentGuest.phase)]?.rules ?? null
      : null;

  // Loading state
  const loading = requestingGuests || requestingHouse;
  if (loading || !house) {
    return <RatsLoadingIndicator />;
  }

  // Empty state - no guest
  if (!loading && !currentGuest) {
    return (
      <EmptyScreen
        icon="user-friends"
        buttonTitle="INVITE GUESTS"
        onPress={() => navigation.navigate(Routes.SendInvites)}
        message="No guests in this house"
      />
    );
  }

  const { firstName, lastName } = currentGuest!;

  const getStatValue = (stat: Stat): number | boolean => {
    if (!summary) return 0;
    switch (stat) {
      case ActivityType.MEETING:
        return summary.stats.meetingsAttended;
      case 'hoursWorked':
        return summary.stats.hoursWorked;
      case 'choreCompleted':
        return summary.stats.choresCompleted;
      case 'metPrimarySupporter':
        return summary.stats.primarySupporterMet > 0;
      case ActivityType.MEDICATION:
        return summary.stats.medicationTaken;
      default:
        return 0;
    }
  };

  const overallPercentage = (() => {
    if (!summary) return 0;
    const statEntries: [Stat, number][] = [
      ['meeting', summary.stats.meetingsAttended],
      ['hoursWorked', summary.stats.hoursWorked],
      ['choreCompleted', summary.stats.choresCompleted],
      ['metPrimarySupporter', summary.stats.primarySupporterMet > 0 ? 1 : 0],
      ['medication', summary.stats.medicationTaken],
    ];
    let total = 0,
      count = 0;
    statEntries.forEach(([stat, value]) => {
      const rule = getPhaseRule(house!, currentGuest!, stat);
      if (rule > 0) {
        total += getPercentage(value, rule);
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : 0;
  })();

  /**
   * Render a stat section with calculated values
   */
  const renderStatSection = (
    stat: Stat,
    suffix: string,
    description?: string,
    testID?: string,
  ) => {
    const statValue = getStatValue(stat);
    const rule = getPhaseRule(house, currentGuest!, stat);
    const percentage = getPercentage(
      typeof statValue === 'boolean' ? (statValue ? 1 : 0) : statValue,
      rule,
    );
    const health = getHealthByPercentage(percentage);

    return (
      <StatSection
        name={STAT_MAP[stat].label}
        description={description || `${statValue} of ${rule} ${suffix}`}
        iconName={HEALTH_ICON_MAP[health]}
        iconColor={HEALTH_COLOR_MAP[health]}
        iconBackgroundColor={STAT_MAP[stat].color}
        boxedIconName={STAT_MAP[stat].icon}
        onPress={() => navigation.navigate(STAT_ROUTE[stat])}
        testID={testID}
      />
    );
  };

  /**
   * Export the current week's compliance report as a PDF and share it.
   * Only available to admins and superAdmins.
   */
  const handleExportPDF = async () => {
    if (!currentGuest || !phaseRules || !summary) {
      Alert.alert(
        'Export Error',
        'Unable to generate report: missing guest or week data.',
      );
      return;
    }
    setExportingPDF(true);
    try {
      const filePath = await exportWeeklyReportPDF(
        currentGuest,
        summary.stats,
        startDate,
        phaseRules,
      );
      await Share.share({
        url: `file://${filePath}`,
        title: 'Compliance Report',
      });
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not generate PDF.');
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <RatsScrollView
      contentContainerStyle={styles.container}
      testID="guest-overview-screen">
      {/******************************* HEADER *******************************/}
      <ScreenHeader
        header={firstName + (lastName ? ' ' + lastName[0] + '.' : '')}
        icon={
          <ClickableIcon
            containerProps={{
              onPress: () => navigation.navigate(Routes.GuestInfo),
            }}
            iconProps={{
              size: normalize(25),
              name: 'user-edit',
              style: { color: color.baby_blue },
            }}
          />
        }
        renderGuestButton
      />

      {/******************************* PHASE ADVANCEMENT ********************************/}
      <AuthConsumer>
        {({ token }) => (
          <PhaseAdvancementBanner
            guest={currentGuest!}
            house={house}
            isAdmin={isAdmin(token, house.id)}
          />
        )}
      </AuthConsumer>

      {/******************************* HEALTH SCORE ********************************/}
      <View testID="week-summary-card">
        <WeekStatSummary
          percentage={overallPercentage}
          header="HEALTH SCORE"
          rightSideContainer={{
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}
          rightSideContent={
            <View style={{ flex: 1, justifyContent: 'space-between' }}>
              <HealthDescription health="super happy" />
              <HealthDescription health="happy" />
              <HealthDescription health="neutral" />
              <HealthDescription health="sad" />
            </View>
          }
        />
      </View>

      {/******************************* STAT SECTIONS *********************************/}
      {renderStatSection('meeting', 'attended', undefined, 'meetings-card')}
      {renderStatSection(
        'hoursWorked',
        'hours worked',
        undefined,
        'job-status-card',
      )}
      {renderStatSection(
        'choreCompleted',
        'completed',
        undefined,
        'chores-card',
      )}
      {renderStatSection(
        'metPrimarySupporter',
        '',
        `Step ${currentGuest!.step || 1}. ${
          getStatValue('metPrimarySupporter')
            ? 'You met your sponsor'
            : 'You have not met your sponsor.'
        }`,
        'sponsor-card',
      )}

      {/******************************* COMPLIANCE BREAKDOWN *******************************/}
      {complianceStatus !== 'loading' &&
        complianceStatus !== 'incomplete-data' &&
        complianceResult !== null &&
        phaseRules !== null && (
          <ComplianceBreakdown
            result={complianceResult}
            phaseRules={phaseRules}
            testID="compliance-breakdown-section"
          />
        )}

      {/******************************* PAY RENT *******************************/}
      {(() => {
        const totalDue =
          (currentGuest!.rentOwed ?? 0) + (currentGuest!.choreFees ?? 0);
        const stripeConnected =
          !!house.stripeAccountId &&
          house.stripeStatus === StripeAccountStatus.ACTIVE;
        const description =
          totalDue > 0 ? `${formatCurrency(totalDue)} due` : 'No balance due';
        const iconName = totalDue > 0 ? 'exclamation-circle' : 'check-circle';
        const iconColor = totalDue > 0 ? color.red : color.green;
        return (
          <StatSection
            name="Pay Rent"
            description={description}
            iconName={stripeConnected ? iconName : 'lock'}
            iconColor={stripeConnected ? iconColor : color.dark_grey}
            boxedIconName="credit-card"
            iconBackgroundColor={color.main}
            onPress={
              stripeConnected
                ? () => navigation.navigate(Routes.RentPayment)
                : null
            }
            testID="pay-rent-card"
          />
        );
      })()}
      <StatSection
        name="Payment History"
        description="View past payments"
        iconName="chevron-right"
        iconColor={color.dark_grey}
        boxedIconName="history"
        iconBackgroundColor={color.dark_grey}
        onPress={() => navigation.navigate(Routes.PaymentHistory)}
        testID="payment-history-card"
      />

      {/******************************* MAKE A PAYMENT (guest only) *******************************/}
      <AuthConsumer>
        {({ token }) =>
          !isAdmin(token, house!.id) ? (
            <StatSection
              name="Make a Payment"
              description="Pay rent or house fees"
              iconName="chevron-right"
              iconColor={color.dark_grey}
              boxedIconName="credit-card"
              iconBackgroundColor={color.green}
              onPress={() => navigation.navigate(Routes.ResidentPayment)}
              testID="make-payment-button"
            />
          ) : null
        }
      </AuthConsumer>

      {/******************************* DOCUMENTS (admin only) *******************************/}
      <AuthConsumer>
        {({ token }) =>
          isAdmin(token, house!.id) ? (
            <StatSection
              name="Documents"
              description="Manage resident files and paperwork"
              iconName="chevron-right"
              iconColor={color.dark_grey}
              boxedIconName="folder-open"
              iconBackgroundColor={color.baby_blue}
              onPress={() =>
                navigation.navigate(Routes.Documents, {
                  houseId: house!.id,
                  guestId: currentGuest?.id,
                  title: `${firstName} Documents`,
                })
              }
              testID="documents-card"
            />
          ) : null
        }
      </AuthConsumer>

      {/******************************* EXPORT COMPLIANCE REPORT (admin only) *******************************/}
      <AuthConsumer>
        {({ token }) =>
          isAdmin(token, house!.id) ? (
            <StatSection
              name={
                exportingPDF ? 'Generating PDF...' : 'Export Compliance Report'
              }
              description="Download this week's PDF compliance report"
              iconName="file-pdf"
              iconColor={color.baby_blue}
              boxedIconName="file-download"
              iconBackgroundColor={color.baby_blue}
              onPress={exportingPDF ? null : handleExportPDF}
              testID="export-compliance-report-card"
            />
          ) : null
        }
      </AuthConsumer>

      {/******************************* STAFF NOTES (admin only) *******************************/}
      <AuthConsumer>
        {({ token }) =>
          isAdmin(token, house!.id) ? (
            <StatSection
              testID="staff-notes-section"
              name="Staff Notes"
              description="Private admin-only notes about this resident"
              boxedIconName="clipboard-list"
              iconBackgroundColor={color.medium_grey}
              iconName="chevron-right"
              iconColor={color.medium_grey}
              onPress={() =>
                navigation.navigate(Routes.StaffNotes, {
                  houseId: house!.id,
                  type: 'resident_note',
                  guestId: currentGuest?.id ?? '',
                  guestName:
                    currentGuest?.displayName ??
                    `${currentGuest?.firstName ?? ''} ${
                      currentGuest?.lastName ?? ''
                    }`.trim() ??
                    undefined,
                })
              }
            />
          ) : null
        }
      </AuthConsumer>

      {/******************************* DISCHARGE RESIDENT (admin only) *******************************/}
      <AuthConsumer>
        {({ token }) =>
          isAdmin(token, house!.id) ? (
            <StatSection
              name="Discharge Resident"
              description="Mark this resident as discharged"
              iconName="sign-out-alt"
              iconColor={color.red}
              boxedIconName="user-times"
              iconBackgroundColor={color.red}
              onPress={() => setShowDischargeModal(true)}
              testID="discharge-resident-card"
            />
          ) : null
        }
      </AuthConsumer>

      {/******************************* DISCHARGE MODAL *******************************/}
      {currentGuest && (
        <DischargeGuestModal
          visible={showDischargeModal}
          guestId={currentGuest.id}
          guestName={
            currentGuest.firstName +
            (currentGuest.lastName ? ' ' + currentGuest.lastName : '')
          }
          onClose={() => setShowDischargeModal(false)}
          onSuccess={() => {
            setShowDischargeModal(false);
            navigation.goBack();
          }}
        />
      )}
    </RatsScrollView>
  );
};

export default GuestHome;
