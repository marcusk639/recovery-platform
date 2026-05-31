/**
 * OxfordOnboardingWizard Screen Tests
 *
 * Covers (ported to shared wizard component tree post-Task 6 refactor):
 * - Step navigation forward via SetupButtons "Next"
 * - Step navigation back via SetupButtons "Back"
 * - Input persistence across step transitions
 * - handleFinish validation: missing houseId, invalid date, invalid EES amount
 *   (now expressed via SetupButtons nextDisabled, not Alert.alert)
 * - handleFinish happy path: correct mutation payload + navigation.replace
 * - Officer filtering: blank names dropped from payload
 * - Default meeting time defaults to 19:00 when blank
 * - Mutation error path logs exception and does not navigate
 * - Pending state renders ActivityIndicator
 * - Error state renders error message
 *
 * Note: The shared SetupButtons component is mocked to expose stable
 * testIDs (setup-buttons-next / setup-buttons-back) and to surface
 * `nextDisabled` via accessibilityState.disabled. RatsWizardSlide is
 * mocked to render only the active step so existing wizard-step-N
 * queries continue to match a single element.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';

// ─── Mutation mock ────────────────────────────────────────────────────────────
const mockMutateAsync = jest.fn();
const mockUseCompleteOxfordOnboarding = jest.fn();

jest.mock('../../../state/mutations/oxfordOnboardingMutations', () => ({
  useCompleteOxfordOnboarding: () => mockUseCompleteOxfordOnboarding(),
}));

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── SetupHeader mock — preserve header text for queries ─────────────────────
jest.mock('../../../components/setup-header', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockSetupHeader(props: {
    header: string;
    description?: string;
  }) {
    return React.createElement(
      View,
      { testID: 'setup-header' },
      React.createElement(Text, null, props.header),
      props.description && React.createElement(Text, null, props.description),
    );
  };
});

// ─── SetupButtons mock — expose stable testIDs for Back/Next ─────────────────
jest.mock('../../../components/setup-buttons', () => {
  const React = require('react');
  const {
    TouchableOpacity,
    Text,
    ActivityIndicator,
    View,
  } = require('react-native');
  return function MockSetupButtons(props: {
    onBackPress: () => void;
    onNextPress: () => void;
    nextDisabled?: boolean;
    hideBack?: boolean;
    isLoading?: boolean;
    nextLabel?: string;
  }) {
    return React.createElement(
      View,
      null,
      !props.hideBack &&
        React.createElement(
          TouchableOpacity,
          { testID: 'setup-buttons-back', onPress: props.onBackPress },
          React.createElement(Text, null, 'BACK'),
        ),
      props.isLoading
        ? React.createElement(ActivityIndicator, null)
        : React.createElement(
            TouchableOpacity,
            {
              testID: 'setup-buttons-next',
              onPress: props.nextDisabled ? undefined : props.onNextPress,
              accessibilityState: { disabled: !!props.nextDisabled },
            },
            React.createElement(
              Text,
              null,
              (props.nextLabel || 'NEXT').toUpperCase(),
            ),
          ),
    );
  };
});

// ─── RatsWizardProgress mock ─────────────────────────────────────────────────
jest.mock('../../../components/rats-wizard-progress', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return function MockProgress(props: {
    stepCount: number;
    currentStep: number;
    currentLabel?: string;
  }) {
    return React.createElement(
      View,
      { testID: 'wizard-progress' },
      React.createElement(
        Text,
        null,
        `Step ${props.currentStep + 1} of ${props.stepCount}${
          props.currentLabel ? ' · ' + props.currentLabel : ''
        }`,
      ),
    );
  };
});

// ─── RatsWizardSlide mock — render ONLY the active step ──────────────────────
jest.mock('../../../components/rats-wizard-slide', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockSlide(props: {
    currentStep: number;
    children: React.ReactNode[];
  }) {
    // Render ONLY the active step so existing testID queries
    // (wizard-step-N) continue to match a single element.
    return React.createElement(
      View,
      { testID: 'wizard-slide' },
      props.children[props.currentStep],
    );
  };
});

// ─── logException mock ────────────────────────────────────────────────────────
const mockLogException = jest.fn();
jest.mock('../../../util/logging', () => ({
  logException: (...args: any[]) => mockLogException(...args),
}));

// ─── DatePicker mock ──────────────────────────────────────────────────────────
// Mirrors the BusinessMeetings test pattern — mocking the module to a string
// makes the picker render as a host component findable via UNSAFE_getAllByType.
jest.mock('react-native-date-picker', () => 'RNDatePicker');

// ─── Navigation mock ──────────────────────────────────────────────────────────
const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
} as any;

// ─── Import under test (after mocks) ──────────────────────────────────────────
import OxfordOnboardingWizard from '../../../screens/Oxford/OxfordOnboardingWizard';
import { Routes } from '../../../navigation/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setupHappyPath() {
  mockUseSelectedHouse.mockReturnValue({
    house: { id: 'house-1', name: 'Test Oxford House' },
  });
  mockMutateAsync.mockResolvedValue(undefined);
  mockUseCompleteOxfordOnboarding.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: false,
  });
}

function renderWizard() {
  return render(<OxfordOnboardingWizard navigation={mockNavigation} />);
}

// Press the SetupButtons Next button until the wizard reaches the requested step.
async function advanceTo(
  step: 1 | 2 | 3 | 4 | 5,
  utils: ReturnType<typeof renderWizard>,
) {
  for (let i = 1; i < step; i++) {
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
  }
}

// Confirm a date via the DatePicker (caller must already be on step 3).
function confirmDate(
  utils: ReturnType<typeof renderWizard>,
  isoDateString: string,
) {
  const pickers = utils.UNSAFE_getAllByType('RNDatePicker' as any);
  act(() => {
    pickers[0].props.onConfirm(new Date(`${isoDateString}T12:00:00Z`));
  });
}

// Fill in a valid date and EES amount, ending on step 5.
async function fillValidAndReachStep5(utils: ReturnType<typeof renderWizard>) {
  await advanceTo(3, utils);
  confirmDate(utils, '2026-06-01');
  await act(async () => {
    fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
  });
  fireEvent.changeText(utils.getByPlaceholderText('0.00'), '450');
  await act(async () => {
    fireEvent.press(utils.getByTestId('setup-buttons-next')); // 4 -> 5
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupHappyPath();
});

// ─── Step rendering ───────────────────────────────────────────────────────────
describe('step rendering', () => {
  it('renders the welcome step by default', () => {
    const { getByTestId } = renderWizard();
    expect(getByTestId('wizard-step-1')).toBeTruthy();
  });

  it('renders step 2 after pressing "Let\'s Get Started"', async () => {
    const utils = renderWizard();
    await advanceTo(2, utils);
    expect(utils.getByTestId('wizard-step-2')).toBeTruthy();
  });

  it('renders step 5 after pressing Next four times', async () => {
    const utils = renderWizard();
    // Need to fill in valid date + EES along the way because nextDisabled
    // would otherwise block advancing past step 3 and step 4.
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 4 -> 5
    });
    expect(utils.getByTestId('wizard-step-5')).toBeTruthy();
  });
});

// ─── Back navigation ──────────────────────────────────────────────────────────
describe('back navigation', () => {
  it('calls navigation.goBack on step 1 back press', () => {
    const { getByTestId } = renderWizard();
    fireEvent.press(getByTestId('setup-buttons-back'));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('decrements step instead of leaving on step 2 back press', async () => {
    const utils = renderWizard();
    await advanceTo(2, utils);
    fireEvent.press(utils.getByTestId('setup-buttons-back'));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(utils.getByTestId('wizard-step-1')).toBeTruthy();
  });
});

// ─── Input persistence ────────────────────────────────────────────────────────
describe('input persistence', () => {
  it('preserves officer names when navigating away from step 2 and back', async () => {
    const utils = renderWizard();
    await advanceTo(2, utils);
    const presidentInput = utils.getByPlaceholderText(
      'President name (optional)',
    );
    fireEvent.changeText(presidentInput, 'Alice Smith');

    // Forward to step 3, back to step 2
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    fireEvent.press(utils.getByTestId('setup-buttons-back'));

    expect(
      utils.getByPlaceholderText('President name (optional)').props.value,
    ).toBe('Alice Smith');
  });
});

// ─── Validation: missing houseId ──────────────────────────────────────────────
describe('validation: missing houseId', () => {
  it('does not call mutation when house is null and Finish is pressed', async () => {
    mockUseSelectedHouse.mockReturnValue({ house: null });
    const utils = renderWizard();
    // Advance through the wizard with valid inputs so step 5 is reachable.
    await fillValidAndReachStep5(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    // handleFinish early-returns silently when houseId is falsy
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });
});

// ─── Validation: invalid date ─────────────────────────────────────────────────
describe('validation: invalid date', () => {
  it('disables Next on step 3 when no date is chosen', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    const nextBtn = utils.getByTestId('setup-buttons-next');
    expect(nextBtn.props.accessibilityState?.disabled).toBe(true);
    // Pressing the disabled button must not advance / call mutation
    await act(async () => {
      fireEvent.press(nextBtn);
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    // Still on step 3
    expect(utils.getByTestId('wizard-step-3')).toBeTruthy();
  });
});

// ─── Validation: invalid EES amount ───────────────────────────────────────────
describe('validation: invalid EES amount', () => {
  it('disables Next on step 4 when EES is blank', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    const nextBtn = utils.getByTestId('setup-buttons-next');
    expect(nextBtn.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(nextBtn);
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(utils.getByTestId('wizard-step-4')).toBeTruthy();
  });

  it('disables Next on step 4 when EES is non-numeric', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), 'abc');
    const nextBtn = utils.getByTestId('setup-buttons-next');
    expect(nextBtn.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(nextBtn);
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(utils.getByTestId('wizard-step-4')).toBeTruthy();
  });

  it('disables Next on step 4 when EES is zero', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '0');
    const nextBtn = utils.getByTestId('setup-buttons-next');
    expect(nextBtn.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(nextBtn);
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(utils.getByTestId('wizard-step-4')).toBeTruthy();
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────
describe('happy path', () => {
  it('calls mutateAsync with the full payload and navigates to OxfordDashboard', async () => {
    const utils = renderWizard();

    // Step 2: officers
    await advanceTo(2, utils);
    fireEvent.changeText(
      utils.getByPlaceholderText('President name (optional)'),
      'Alice',
    );
    fireEvent.changeText(
      utils.getByPlaceholderText('Treasurer name (optional)'),
      'Bob',
    );
    fireEvent.changeText(
      utils.getByPlaceholderText('Secretary name (optional)'),
      'Carol',
    );

    // Step 3: meeting
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    confirmDate(utils, '2026-06-01');
    fireEvent.changeText(utils.getByPlaceholderText('19:00'), '20:30');

    // Step 4: EES
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '450');

    // Step 5: finish
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      houseId: 'house-1',
      officers: [
        { role: 'president', name: 'Alice' },
        { role: 'treasurer', name: 'Bob' },
        { role: 'secretary', name: 'Carol' },
      ],
      firstMeeting: { scheduledDate: '2026-06-01T20:30:00' },
      eesMonthlyAmount: 450,
    });
    expect(mockNavigation.replace).toHaveBeenCalledWith(Routes.OxfordDashboard);
  });

  it('drops blank officer names from the payload', async () => {
    const utils = renderWizard();
    await advanceTo(2, utils);
    // Only fill president, leave treasurer + secretary blank
    fireEvent.changeText(
      utils.getByPlaceholderText('President name (optional)'),
      'Alice',
    );
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        officers: [{ role: 'president', name: 'Alice' }],
      }),
    );
  });

  it('defaults meeting time to 19:00 when blank', async () => {
    const utils = renderWizard();
    await fillValidAndReachStep5(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        firstMeeting: { scheduledDate: '2026-06-01T19:00:00' },
      }),
    );
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────
describe('error path', () => {
  it('logs exception and does not navigate when mutation rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('firestore unavailable'));
    const utils = renderWizard();
    await fillValidAndReachStep5(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next'));
    });
    expect(mockLogException).toHaveBeenCalledTimes(1);
    expect(mockLogException).toHaveBeenCalledWith(expect.any(Error));
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });
});

// ─── Pending and error UI states ──────────────────────────────────────────────
describe('pending and error UI states', () => {
  it('renders ActivityIndicator when mutation is pending', async () => {
    mockUseCompleteOxfordOnboarding.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
      isError: false,
    });
    const utils = renderWizard();
    // Need valid inputs to reach step 5 (nextDisabled is false on step 4
    // when pending — but step 3 still requires a date).
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 4 -> 5
    });
    expect(utils.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    // Next button is replaced by the loading indicator in SetupButtons
    expect(utils.queryByTestId('setup-buttons-next')).toBeNull();
  });

  it('renders "Setup failed" message when isError is true', async () => {
    mockUseCompleteOxfordOnboarding.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: true,
    });
    const utils = renderWizard();
    await advanceTo(3, utils);
    confirmDate(utils, '2026-06-01');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 3 -> 4
    });
    fireEvent.changeText(utils.getByPlaceholderText('0.00'), '100');
    await act(async () => {
      fireEvent.press(utils.getByTestId('setup-buttons-next')); // 4 -> 5
    });
    expect(utils.getByText('Setup failed. Please try again.')).toBeTruthy();
  });
});

// ─── Step 3 date picker (UX parity with BusinessMeetings) ─────────────────────
describe('step 3 date picker', () => {
  it('does NOT render a raw TextInput with placeholder "2026-06-01"', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    expect(utils.queryByPlaceholderText('2026-06-01')).toBeNull();
  });

  it('renders the DatePicker modal (RNDatePicker) in date mode', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    const pickers = utils.UNSAFE_getAllByType('RNDatePicker' as any);
    expect(pickers.length).toBeGreaterThan(0);
    expect(pickers[0].props.mode).toBe('date');
    expect(pickers[0].props.modal).toBe(true);
  });

  it('DatePicker receives a Date object as its date prop', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    const pickers = utils.UNSAFE_getAllByType('RNDatePicker' as any);
    expect(pickers[0].props.date).toBeInstanceOf(Date);
  });

  it('opens DatePicker when the date display TouchableOpacity is pressed', async () => {
    const utils = renderWizard();
    await advanceTo(3, utils);
    let pickers = utils.UNSAFE_getAllByType('RNDatePicker' as any);
    expect(pickers[0].props.open).toBe(false);

    await act(async () => {
      fireEvent.press(utils.getByTestId('wizard-date-display'));
    });

    pickers = utils.UNSAFE_getAllByType('RNDatePicker' as any);
    expect(pickers[0].props.open).toBe(true);
  });
});
