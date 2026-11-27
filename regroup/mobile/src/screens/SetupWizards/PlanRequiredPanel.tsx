import React from 'react';
import { SetupScreenNavigationProp } from '../../navigation/types';
import { openWebBilling } from '../../services/webBilling';
import SetupBlockingPanel from './SetupBlockingPanel';

interface PlanRequiredPanelProps {
  navigation?: SetupScreenNavigationProp;
  onCheckAgain: () => void;
}

/**
 * Shown by OrgSetup instead of the wizard when the operator has no active
 * plan, so they find out before entering houses rather than at the end.
 * "View plans" opens the web pricing page in the browser (launch P5 Task 9).
 */
const PlanRequiredPanel: React.FC<PlanRequiredPanelProps> = ({ onCheckAgain }) => (
  <SetupBlockingPanel
    testID="plan-required-panel"
    title="You need an active plan"
    body="Creating houses requires an active Regroup subscription. Choose a plan, then come back and tap Check again."
    primaryTitle="View plans"
    primaryTestID="plan-required-view-plans"
    onPrimary={() => openWebBilling('pricing')}
    secondaryTitle="Check again"
    secondaryTestID="plan-required-check-again"
    onSecondary={onCheckAgain}
  />
);

export default PlanRequiredPanel;
