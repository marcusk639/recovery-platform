/**
 * Tests for ComplianceBreakdown component
 *
 * Verifies that:
 * - All always-shown rows (meetings, work hours) render
 * - Conditional rows (chore, medication, supporter) appear only when the phase requires them
 * - Pass / fail badge labels are correct
 * - The overall banner reflects the top-level compliant flag
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import ComplianceBreakdown from '../ComplianceBreakdown';
import { ComplianceResult } from '../../../util/compliance';
import { PhaseRule } from '../../../entities/Phase';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ComplianceResult> = {}): ComplianceResult {
  return {
    compliant: true,
    requirements: {
      meetings: { required: 3, actual: 3, met: true },
      hoursWorked: { required: 20, actual: 20, met: true },
      choresCompleted: { required: 1, actual: 1, met: true },
      medicationTaken: { required: false, actual: false, met: true },
      primarySupporterMet: { required: false, actual: false, met: true },
    },
    ...overrides,
  };
}

function makePhaseRule(overrides: Partial<PhaseRule> = {}): PhaseRule {
  return {
    meetings: 3,
    work: 20,
    chore: true,
    medications: false,
    supporter: false,
    nightsOutAllowed: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComplianceBreakdown', () => {
  describe('always-shown rows', () => {
    it('always renders the meetings row', () => {
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule()}
        />,
      );
      expect(getByTestId('compliance-row-meetings')).toBeTruthy();
    });

    it('always renders the work hours row', () => {
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule()}
        />,
      );
      expect(getByTestId('compliance-row-hours')).toBeTruthy();
    });
  });

  describe('conditional rows — chore', () => {
    it('renders chore row when phase requires it', () => {
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule({ chore: true })}
        />,
      );
      expect(getByTestId('compliance-row-chore')).toBeTruthy();
    });

    it('does NOT render chore row when phase does not require it', () => {
      const { queryByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule({ chore: false })}
        />,
      );
      expect(queryByTestId('compliance-row-chore')).toBeNull();
    });
  });

  describe('conditional rows — medication', () => {
    it('renders medication row when phase requires it', () => {
      const result = makeResult({
        requirements: {
          ...makeResult().requirements,
          medicationTaken: { required: true, actual: true, met: true },
        },
      });
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={result}
          phaseRules={makePhaseRule({ medications: true })}
        />,
      );
      expect(getByTestId('compliance-row-medication')).toBeTruthy();
    });

    it('does NOT render medication row when phase does not require it', () => {
      const { queryByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule({ medications: false })}
        />,
      );
      expect(queryByTestId('compliance-row-medication')).toBeNull();
    });
  });

  describe('conditional rows — supporter', () => {
    it('renders supporter row when phase requires it', () => {
      const result = makeResult({
        requirements: {
          ...makeResult().requirements,
          primarySupporterMet: { required: true, actual: true, met: true },
        },
      });
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={result}
          phaseRules={makePhaseRule({ supporter: true })}
        />,
      );
      expect(getByTestId('compliance-row-supporter')).toBeTruthy();
    });

    it('does NOT render supporter row when phase does not require it', () => {
      const { queryByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule({ supporter: false })}
        />,
      );
      expect(queryByTestId('compliance-row-supporter')).toBeNull();
    });
  });

  describe('overall banner', () => {
    it('shows "All requirements met" when compliant', () => {
      const { getByText } = render(
        <ComplianceBreakdown
          result={makeResult({ compliant: true })}
          phaseRules={makePhaseRule()}
        />,
      );
      expect(getByText('All requirements met')).toBeTruthy();
    });

    it('shows "Requirements not met" when non-compliant', () => {
      const result = makeResult({
        compliant: false,
        requirements: {
          ...makeResult().requirements,
          meetings: { required: 3, actual: 1, met: false },
        },
      });
      const { getByText } = render(
        <ComplianceBreakdown result={result} phaseRules={makePhaseRule()} />,
      );
      expect(getByText('Requirements not met')).toBeTruthy();
    });
  });

  describe('badge labels', () => {
    it('shows "Met" badge when a requirement is met', () => {
      const { getAllByText } = render(
        <ComplianceBreakdown result={makeResult()} phaseRules={makePhaseRule()} />,
      );
      // Meetings and hours are both met → at least two "Met" badges
      const metBadges = getAllByText('Met');
      expect(metBadges.length).toBeGreaterThanOrEqual(2);
    });

    it('shows "Not met" badge when a requirement is not met', () => {
      const result = makeResult({
        compliant: false,
        requirements: {
          ...makeResult().requirements,
          meetings: { required: 3, actual: 0, met: false },
        },
      });
      const { getAllByText } = render(
        <ComplianceBreakdown result={result} phaseRules={makePhaseRule()} />,
      );
      expect(getAllByText('Not met').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('section header', () => {
    it('renders the section header text', () => {
      const { getByText } = render(
        <ComplianceBreakdown result={makeResult()} phaseRules={makePhaseRule()} />,
      );
      expect(getByText("THIS WEEK'S COMPLIANCE")).toBeTruthy();
    });
  });

  describe('testID', () => {
    it('uses default testID when none provided', () => {
      const { getByTestId } = render(
        <ComplianceBreakdown result={makeResult()} phaseRules={makePhaseRule()} />,
      );
      expect(getByTestId('compliance-breakdown')).toBeTruthy();
    });

    it('uses custom testID when provided', () => {
      const { getByTestId } = render(
        <ComplianceBreakdown
          result={makeResult()}
          phaseRules={makePhaseRule()}
          testID="custom-id"
        />,
      );
      expect(getByTestId('custom-id')).toBeTruthy();
    });
  });

  describe('all-requirements scenario', () => {
    it('renders all five rows when all phase requirements are active', () => {
      const result = makeResult({
        compliant: true,
        requirements: {
          meetings: { required: 3, actual: 3, met: true },
          hoursWorked: { required: 20, actual: 20, met: true },
          choresCompleted: { required: 1, actual: 1, met: true },
          medicationTaken: { required: true, actual: true, met: true },
          primarySupporterMet: { required: true, actual: true, met: true },
        },
      });
      const phaseRules = makePhaseRule({
        chore: true,
        medications: true,
        supporter: true,
      });

      const { getByTestId } = render(
        <ComplianceBreakdown result={result} phaseRules={phaseRules} />,
      );

      expect(getByTestId('compliance-row-meetings')).toBeTruthy();
      expect(getByTestId('compliance-row-hours')).toBeTruthy();
      expect(getByTestId('compliance-row-chore')).toBeTruthy();
      expect(getByTestId('compliance-row-medication')).toBeTruthy();
      expect(getByTestId('compliance-row-supporter')).toBeTruthy();
    });

    it('renders only meetings and hours when phase has no optional requirements', () => {
      const result = makeResult({
        compliant: true,
        requirements: {
          meetings: { required: 3, actual: 3, met: true },
          hoursWorked: { required: 20, actual: 20, met: true },
          choresCompleted: { required: 0, actual: 0, met: true },
          medicationTaken: { required: false, actual: false, met: true },
          primarySupporterMet: { required: false, actual: false, met: true },
        },
      });
      const phaseRules = makePhaseRule({
        chore: false,
        medications: false,
        supporter: false,
      });

      const { getByTestId, queryByTestId } = render(
        <ComplianceBreakdown result={result} phaseRules={phaseRules} />,
      );

      expect(getByTestId('compliance-row-meetings')).toBeTruthy();
      expect(getByTestId('compliance-row-hours')).toBeTruthy();
      expect(queryByTestId('compliance-row-chore')).toBeNull();
      expect(queryByTestId('compliance-row-medication')).toBeNull();
      expect(queryByTestId('compliance-row-supporter')).toBeNull();
    });
  });
});
