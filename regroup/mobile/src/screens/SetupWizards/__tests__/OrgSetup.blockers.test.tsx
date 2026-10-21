// OrgSetup renders a blocking panel instead of the wizard (so COMPLETE SETUP
// is unreachable) while useOrgSetupBlocker reports a blocker.
let mockBlocker: { kind: string | null; checkAgain: jest.Mock };
jest.mock('../../../hooks/useOrgSetupBlocker', () => ({ useOrgSetupBlocker: () => mockBlocker }));
jest.mock('../../../hooks/useHouseSetupWizard', () => ({
  useHouseSetupWizard: () => ({
    houses: { h1: { id: 'h1', name: 'House One' } },
    submitting: false,
    submittingSuccessful: false,
    submittingFailed: false,
    submitHouse: jest.fn(),
    resetSetup: jest.fn(),
  }),
}));
jest.mock('../../../context', () => ({
  useModal: () => ({ setLoadingModalState: jest.fn() }),
  useNotification: () => ({ notify: jest.fn(), showPopover: jest.fn() }),
  useTheme: () => ({ theme: { primaryFontFamily: 'System', secondaryFontFamily: 'System' } }),
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('../SetupRecoveryPanel', () => {
  const { Text } = require('react-native');
  return () => <Text testID="setup-recovery-panel">recovery</Text>;
});
jest.mock('../PlanRequiredPanel', () => {
  const { Text } = require('react-native');
  return () => <Text testID="plan-required-panel">plan</Text>;
});
jest.mock('../../../components/screen-header', () => () => null);
jest.mock('../../../components/help-icon', () => () => null);
jest.mock('../../../services/house', () => ({ createHouseId: jest.fn() }));

import React from 'react';
import { render } from '@testing-library/react-native';
import OrgSetup from '../OrgSetup';

const renderOrgSetup = () =>
  render(<OrgSetup {...({ navigation: { navigate: jest.fn() } } as any)} />);

describe('OrgSetup blockers', () => {
  it.each([
    ['setup-recovery', 'setup-recovery-panel'],
    ['plan-required', 'plan-required-panel'],
  ])('%s: shows the panel and no COMPLETE SETUP button', (kind, panel) => {
    mockBlocker = { kind, checkAgain: jest.fn() };
    const { getByTestId, queryByTestId } = renderOrgSetup();
    expect(getByTestId(panel)).toBeTruthy();
    expect(queryByTestId('complete-setup-button')).toBeNull();
    expect(queryByTestId('org-setup-screen')).toBeNull();
  });

  it('shows the wizard when nothing blocks', () => {
    mockBlocker = { kind: null, checkAgain: jest.fn() };
    const { getByTestId } = renderOrgSetup();
    expect(getByTestId('complete-setup-button')).toBeTruthy();
  });
});
