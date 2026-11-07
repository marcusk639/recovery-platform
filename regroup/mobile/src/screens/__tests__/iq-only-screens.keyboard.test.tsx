/**
 * Screens where only IQKeyboardManager (iOS) and adjustResize (Android) kept
 * a focused field visible (docs/build/react-native-0.88-keyboard-audit.md,
 * §5 note 6). After plan Task 15 every text field on them sits in a
 * RatsScrollView or a keyboard-controller avoiding view. The other screens of
 * that list are covered beside their own suites (DrugTestForm,
 * BusinessMeetingDetail, IntakeFormScreen, FinancialRecordForm,
 * DischargeGuestModal, RatsModal, ModalContext).
 */
import React from 'react';
import { TextInput } from 'react-native';
import { render } from '@testing-library/react-native';
import { keyboardAncestor } from '../../components/rats-keyboard/__tests__/keyboardAncestor';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() }),
  useRoute: () => ({ params: { houseId: 'h1', houseName: 'House', appId: 'a1' } }),
}));

jest.mock('../../state/queries/applicationQueries', () => ({
  useSubmitApplication: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useHouseApplications: () => ({
    data: [{ id: 'a1', status: 'pending', name: 'Applicant', programType: 'standard' }],
    isLoading: false,
  }),
  useUpdateApplicationStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: { id: 'h1', name: 'House' }, houseId: 'h1' }),
}));

jest.mock('../../state/mutations/oxfordOnboardingMutations', () => ({
  useCompleteOxfordOnboarding: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
}));

jest.mock('../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import ApplyScreen from '../Application/ApplyScreen';
import ApplicationDetailScreen from '../Applications/ApplicationDetailScreen';
import OxfordOnboardingWizard from '../Oxford/OxfordOnboardingWizard';

describe('IQKeyboardManager-only screens keep their fields above the keyboard', () => {
  it('ApplyScreen', () => {
    const view = render(<ApplyScreen />);
    expect(keyboardAncestor(view.getByTestId('input-name'))).toBe('RatsScrollView');
  });

  it('ApplicationDetailScreen', () => {
    const view = render(<ApplicationDetailScreen />);
    const note = view.getByPlaceholderText(
      'Leave a message visible to the applicant on decision...',
    );
    expect(keyboardAncestor(note)).toBe('RatsScrollView');
  });

  it('OxfordOnboardingWizard: every field on every step', () => {
    const view = render(
      <OxfordOnboardingWizard
        {...({ navigation: { replace: jest.fn(), goBack: jest.fn() } } as any)}
      />,
    );
    const inputs = view.UNSAFE_getAllByType(TextInput);
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    for (const input of inputs) {
      expect(keyboardAncestor(input)).toBe('RatsScrollView');
    }
  });

  it('OxfordOnboardingWizard: the pinned Back/Next row sits in the Android resize view', () => {
    const view = render(
      <OxfordOnboardingWizard
        {...({ navigation: { replace: jest.fn(), goBack: jest.fn() } } as any)}
      />,
    );
    expect(keyboardAncestor(view.getByTestId('oxford-wizard-slide'))).toBe(
      'RatsKeyboardAvoidingView',
    );
    expect(keyboardAncestor(view.getByTestId('setup-buttons-next'))).toBe('RatsKeyboardAvoidingView');
  });
});
