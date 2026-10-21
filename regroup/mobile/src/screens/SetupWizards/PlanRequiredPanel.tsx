import React from 'react';
import { Routes, SetupScreenNavigationProp } from '../../navigation/types';
import SetupBlockingPanel from './SetupBlockingPanel';

interface PlanRequiredPanelProps {
  navigation?: SetupScreenNavigationProp;
  onCheckAgain: () => void;
}

/**
 * Shown by OrgSetup instead of the wizard when the operator has no active
 * plan, so they find out before entering houses rather than at the end.
 */
const PlanRequiredPanel: React.FC<PlanRequiredPanelProps> = ({ navigation, onCheckAgain }) => (
  <SetupBlockingPanel
    testID="plan-required-panel"
    title="You need an active plan"
    body="Creating houses requires an active Regroup subscription. Choose a plan, then come back and tap Check again."
    primaryTitle="View plans"
    primaryTestID="plan-required-view-plans"
    onPrimary={() => navigation?.navigate(Routes.SubscriptionHandler)}
    secondaryTitle="Check again"
    secondaryTestID="plan-required-check-again"
    onSecondary={onCheckAgain}
  />
);

export default PlanRequiredPanel;
