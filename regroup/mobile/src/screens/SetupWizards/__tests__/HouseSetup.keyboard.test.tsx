/**
 * HouseSetup's keyboard handling after IQKeyboardManager (plan Task 15).
 *
 * Focusing the address field used to set IQKeyboardManager's distance to
 * normalize(100) on iOS (app-wide, never reset). It is now this screen's
 * RatsScrollView bottomOffset. The Android branch (setHeight(normalize(115)))
 * is kept as it was.
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { normalize } from '../../../styles/theme';
import { KEYBOARD_TOOLBAR_SPACE } from '../../../components/rats-keyboard';

let mockIOS = true;
jest.mock('../../../util/platform', () => ({
  ...jest.requireActual('../../../util/platform'),
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));

// Every state update in the tree, with stable setters. HouseSetup's height
// state is never rendered, so its setter is the only way to see it. (A spy on
// React.useState would miss it: Babel's import interop copies the module.)
const mockSetStateCalls: unknown[] = [];
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  const wrapped = new WeakMap<object, any>();
  return {
    ...actual,
    useState: (initial: any) => {
      const [value, set] = actual.useState(initial);
      if (!wrapped.has(set)) {
        wrapped.set(set, (nextState: any) => {
          mockSetStateCalls.push(nextState);
          set(nextState);
        });
      }
      return [value, wrapped.get(set)];
    },
  };
});

jest.mock('../../../hooks/useHouseSetupWizard', () => ({
  useHouseSetupWizard: () => ({ selectedHouse: undefined, updateHouse: jest.fn() }),
}));

jest.mock('../OperatorSetupWizard', () => ({ SetupButtons: () => null }));

jest.mock('../../../components/rats-image-picker', () => () => null);

// The address field is a Google Places input; a plain TextInput that keeps
// the Field's onFocus is enough here.
jest.mock('../../../components/rats-text-input/rats-text-input', () => {
  const { TextInput: Input } = require('react-native');
  return (props: any) => (
    <Input testID={props.testID} onFocus={props.onFocus} value={props.field?.value} />
  );
});

jest.mock('../../../context', () => ({
  useNotification: () => ({ notify: jest.fn(), showPopover: jest.fn(), setPopoverRef: jest.fn() }),
  useModal: () => ({ showFormModal: jest.fn(), dismissFormModal: jest.fn() }),
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000', backgroundColor: '#fff' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { HouseSetup } from '../HouseSetup';

const renderSetup = () =>
  render(<HouseSetup {...({ navigation: { navigate: jest.fn() } } as any)} />);

describe('HouseSetup keyboard', () => {
  afterEach(() => {
    mockIOS = true;
  });

  it('keeps the 100pt iOS keyboard distance as the scroll view bottomOffset', () => {
    const scroll = renderSetup().UNSAFE_getByType(ScrollView);
    expect(scroll.props.bottomOffset).toBe(normalize(100) + KEYBOARD_TOOLBAR_SPACE);
    expect(scroll.props.enabled).toBe(true);
  });

  it('keeps the default 75pt gap on Android', () => {
    mockIOS = false;
    const scroll = renderSetup().UNSAFE_getByType(ScrollView);
    expect(scroll.props.bottomOffset).toBe(75);
  });

  it('keeps the Android setHeight(normalize(115)) on address focus', () => {
    mockIOS = false;
    const view = renderSetup();
    mockSetStateCalls.length = 0;
    fireEvent(view.getByTestId('house-address-input'), 'focus');
    expect(mockSetStateCalls).toContain(normalize(115));
  });

  it('leaves the height state alone on iOS', () => {
    const view = renderSetup();
    mockSetStateCalls.length = 0;
    fireEvent(view.getByTestId('house-address-input'), 'focus');
    expect(mockSetStateCalls).not.toContain(normalize(115));
    // The focus did reach the screen: it records the focused field.
    expect(mockSetStateCalls).toContain('address');
  });
});
