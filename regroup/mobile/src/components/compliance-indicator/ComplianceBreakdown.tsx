/**
 * ComplianceBreakdown
 *
 * Displays a per-requirement compliance summary for a single guest.
 * Shows a pass/fail row for each requirement that is active under the
 * guest's current phase.  Requirements that are not required by the phase
 * (e.g. medication when phase.medications === false) are omitted entirely.
 *
 * Designed to be embedded inside the GuestHome (guest detail) screen.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../rats-text';
import { color, fontSize, fontFamily, normalize, CARD_STYLE } from '../../styles/theme';
import { ComplianceResult } from '../../util/compliance';
import { PhaseRule } from '../../entities/Phase';

interface RequirementRowProps {
  label: string;
  /** Human-readable actual / required description, e.g. "2 of 3" */
  description: string;
  met: boolean;
  testID?: string;
}

const RequirementRow: React.FC<RequirementRowProps> = ({ label, description, met, testID }) => {
  return (
    <View style={styles.requirementRow} testID={testID}>
      <View style={styles.requirementLeft}>
        <RatsText
          translate={false}
          text={label}
          style={styles.requirementLabel}
        />
        <RatsText
          translate={false}
          text={description}
          style={styles.requirementDescription}
        />
      </View>
      <View style={[styles.badge, met ? styles.badgeMet : styles.badgeNotMet]}>
        <RatsText
          translate={false}
          text={met ? 'Met' : 'Not met'}
          style={[styles.badgeText, met ? styles.badgeTextMet : styles.badgeTextNotMet]}
        />
      </View>
    </View>
  );
};

interface ComplianceBreakdownProps {
  result: ComplianceResult;
  /** Phase rules for the current guest — used to decide which rows to show */
  phaseRules: PhaseRule;
  testID?: string;
}

/**
 * ComplianceBreakdown - Full per-requirement compliance view.
 *
 * Only renders rows for requirements that are active in the guest's phase.
 * Meetings and work hours are always shown (they are always non-zero for
 * any meaningful phase).  Chore, medication, and supporter rows are shown
 * only when those rules are enabled.
 */
const ComplianceBreakdown: React.FC<ComplianceBreakdownProps> = ({
  result,
  phaseRules,
  testID,
}) => {
  const { requirements } = result;

  return (
    <View style={[CARD_STYLE, styles.container]} testID={testID || 'compliance-breakdown'}>
      {/* Section header */}
      <RatsText
        translate={false}
        text="THIS WEEK'S COMPLIANCE"
        style={styles.sectionHeader}
      />

      {/* Overall status banner */}
      <View
        style={[styles.overallBanner, result.compliant ? styles.bannerCompliant : styles.bannerNonCompliant]}
        testID="compliance-overall-banner"
      >
        <RatsText
          translate={false}
          text={result.compliant ? 'All requirements met' : 'Requirements not met'}
          style={styles.bannerText}
        />
      </View>

      {/* Per-requirement rows */}

      {/* Meetings — always shown */}
      <RequirementRow
        testID="compliance-row-meetings"
        label="Meetings"
        description={`${requirements.meetings.actual} of ${requirements.meetings.required}`}
        met={requirements.meetings.met}
      />

      {/* Work hours — always shown */}
      <RequirementRow
        testID="compliance-row-hours"
        label="Work hours"
        description={`${requirements.hoursWorked.actual} of ${requirements.hoursWorked.required} hrs`}
        met={requirements.hoursWorked.met}
      />

      {/* Chore — only shown when required by phase */}
      {phaseRules.chore && (
        <RequirementRow
          testID="compliance-row-chore"
          label="Chore"
          description={requirements.choresCompleted.met ? 'Completed' : 'Not completed'}
          met={requirements.choresCompleted.met}
        />
      )}

      {/* Medication — only shown when required by phase */}
      {phaseRules.medications && (
        <RequirementRow
          testID="compliance-row-medication"
          label="Medication"
          description={requirements.medicationTaken.actual ? 'Logged' : 'Not logged'}
          met={requirements.medicationTaken.met}
        />
      )}

      {/* Primary supporter — only shown when required by phase */}
      {phaseRules.supporter && (
        <RequirementRow
          testID="compliance-row-supporter"
          label="Supporter"
          description={requirements.primarySupporterMet.actual ? 'Met this week' : 'Not met this week'}
          met={requirements.primarySupporterMet.met}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: normalize(2),
    paddingBottom: normalize(4),
  },
  sectionHeader: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
    marginBottom: normalize(8),
  },
  overallBanner: {
    borderRadius: normalize(4),
    paddingVertical: normalize(6),
    paddingHorizontal: normalize(10),
    marginBottom: normalize(10),
    alignItems: 'center',
  },
  bannerCompliant: {
    backgroundColor: '#e6f4ec',
    borderWidth: 1,
    borderColor: color.green,
  },
  bannerNonCompliant: {
    backgroundColor: '#fce8e8',
    borderWidth: 1,
    borderColor: color.red,
  },
  bannerText: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.black,
  },
  requirementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: normalize(6),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.medium_grey,
  },
  requirementLeft: {
    flex: 1,
    marginRight: normalize(10),
  },
  requirementLabel: {
    fontSize: fontSize.regular,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  requirementDescription: {
    fontSize: fontSize.small,
    color: color.dark_grey,
  },
  badge: {
    paddingVertical: normalize(3),
    paddingHorizontal: normalize(8),
    borderRadius: normalize(10),
    minWidth: normalize(60),
    alignItems: 'center',
  },
  badgeMet: {
    backgroundColor: '#e6f4ec',
    borderWidth: 1,
    borderColor: color.green,
  },
  badgeNotMet: {
    backgroundColor: '#fce8e8',
    borderWidth: 1,
    borderColor: color.red,
  },
  badgeText: {
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
  },
  badgeTextMet: {
    color: color.green,
  },
  badgeTextNotMet: {
    color: color.red,
  },
});

export default ComplianceBreakdown;
